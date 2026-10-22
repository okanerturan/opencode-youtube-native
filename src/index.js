// OpenCode V2 Plugin: Native YouTube Video Understanding for Gemini (OpenCode Go / Zen / Google)
// Turns YouTube URLs in the latest user prompt into native Gemini `fileData.fileUri` parts.
// Only runs on the primary agent loop, never on title or compaction requests.

const YT_REGEX =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}[^\s)"'<>]*/g;

/**
 * Canonicalize watch/short/live/youtu.be links into the standard watch?v=ID form
 * that Gemini accepts for fileData.fileUri.
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
    // fall through to the raw match
  }
  return rawUrl;
}

export default {
  id: "opencode-youtube-native",
  async setup(ctx) {
    await ctx.session.hook("http.request", async (event) => {
      // Primary loop only. Skip title, compaction, and transient generate requests.
      if (event.kind && event.kind !== "primary") return;

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

      // Avoid attaching the same video twice when history already carries it.
      const existing = new Set();
      for (const content of body.contents) {
        if (!Array.isArray(content.parts)) continue;
        for (const part of content.parts) {
          if (part.fileData?.fileUri) existing.add(part.fileData.fileUri);
        }
      }

      // Attach to the newest real user turn. During tool loops the newest turn is a
      // functionResponse, so walk back to the prompt that carried the link.
      let target = null;
      for (let i = body.contents.length - 1; i >= 0; i -= 1) {
        const content = body.contents[i];
        if (content.role !== "user" || !Array.isArray(content.parts)) continue;
        if (content.parts.some((part) => part.functionResponse)) continue;
        if (content.parts.some((part) => typeof part.text === "string" && part.text.trim())) {
          target = content;
          break;
        }
      }
      if (!target) return;

      const newParts = [];
      for (const part of target.parts) {
        if (typeof part.text !== "string") continue;
        const matches = part.text.match(YT_REGEX);
        if (!matches) continue;

        for (const match of matches) {
          const canonical = canonicalizeYouTubeUrl(match);
          if (existing.has(canonical)) continue;
          existing.add(canonical);
          newParts.push({
            fileData: {
              mimeType: "video/mp4",
              fileUri: canonical,
            },
          });
        }
      }

      if (newParts.length === 0) return;

      target.parts.unshift(...newParts);

      const headers = new Headers(event.request.headers);
      headers.delete("content-length");
      event.request = new Request(event.request.url, {
        method: event.request.method,
        headers,
        body: JSON.stringify(body),
      });
    });
  },
};
