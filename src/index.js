// OpenCode V2 Plugin: Native YouTube Video Understanding for Gemini (OpenCode Go / Zen / Google)
// Automatically turns YouTube URLs in user prompts into native Gemini `fileData.fileUri` multimodal parts.

const YT_REGEX =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}[^\s)"'<>]*/g;

/**
 * Canonicalize any YouTube watch/short/live/youtu.be link into standard watch?v=ID format
 * which Google's Gemini backend expects for fileData.fileUri.
 */
function canonicalizeYouTubeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    let videoId = null;
    if (parsed.hostname === "youtu.be") {
      videoId = parsed.pathname.slice(1).split("/")[0];
    } else if (parsed.pathname === "/watch") {
      videoId = parsed.searchParams.get("v");
    } else {
      const match = parsed.pathname.match(/^\/(?:shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (match) videoId = match[1];
    }
    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
  } catch {
    // Fallback to raw match if URL parsing fails
  }
  return rawUrl;
}

export default {
  id: "opencode-youtube-native",
  async setup(ctx) {
    await ctx.session.hook("http.request", async (event) => {
      // Only intercept Gemini native endpoints (Google AI Studio, OpenCode Go, OpenCode Zen)
      const url = event.request.url;
      if (!url.includes("/google/") && !url.includes("generativelanguage.googleapis.com")) {
        return;
      }

      const rawText = await event.request.clone().text();
      if (!rawText) return;

      let body;
      try {
        body = JSON.parse(rawText);
      } catch {
        return;
      }

      if (!Array.isArray(body.contents)) return;

      let modified = false;

      for (const content of body.contents) {
        if (content.role !== "user" || !Array.isArray(content.parts)) continue;

        // Skip tool-result turns (functionResponse) so we only attach to user prompts
        if (content.parts.some((p) => p.functionResponse)) continue;

        const existingUris = new Set(
          content.parts
            .filter((p) => p.fileData?.fileUri)
            .map((p) => p.fileData.fileUri)
        );

        const newParts = [];
        for (const part of content.parts) {
          if (typeof part.text !== "string") continue;
          const matches = part.text.match(YT_REGEX);
          if (!matches) continue;

          for (const match of matches) {
            const canonical = canonicalizeYouTubeUrl(match);
            if (!existingUris.has(canonical)) {
              existingUris.add(canonical);
              newParts.push({
                fileData: {
                  mimeType: "video/mp4",
                  fileUri: canonical,
                },
              });
              modified = true;
            }
          }
        }

        if (newParts.length > 0) {
          content.parts.unshift(...newParts);
        }
      }

      if (modified) {
        const headers = new Headers(event.request.headers);
        headers.delete("content-length");
        event.request = new Request(event.request.url, {
          method: event.request.method,
          headers,
          body: JSON.stringify(body),
        });
      }
    });
  },
};
