import { Plugin } from "@opencode/plugin";

const YT_REGEX =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}[^\s)"'<>]*/g;

function canonicalizeYouTubeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    let videoId: string | null = null;
    if (parsed.hostname === "youtu.be") {
      videoId = parsed.pathname.slice(1).split("/")[0] ?? null;
    } else if (parsed.pathname === "/watch") {
      videoId = parsed.searchParams.get("v");
    } else {
      const match = parsed.pathname.match(/^\/(?:shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (match) videoId = match[1] ?? null;
    }
    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
  } catch {
    // Fallback to raw match
  }
  return rawUrl;
}

export default Plugin.define({
  id: "opencode-youtube-native",
  async setup(ctx) {
    await ctx.session.hook("http.request", async (event) => {
      const url = event.request.url;
      if (!url.includes("/google/") && !url.includes("generativelanguage.googleapis.com")) {
        return;
      }

      const rawText = await event.request.clone().text();
      if (!rawText) return;

      let body: any;
      try {
        body = JSON.parse(rawText);
      } catch {
        return;
      }

      if (!Array.isArray(body.contents)) return;

      let modified = false;

      for (const content of body.contents) {
        if (content.role !== "user" || !Array.isArray(content.parts)) continue;
        if (content.parts.some((p: any) => p.functionResponse)) continue;

        const existingUris = new Set<string>(
          content.parts
            .filter((p: any) => p.fileData?.fileUri)
            .map((p: any) => p.fileData.fileUri)
        );

        const newParts: Array<{ fileData: { mimeType: string; fileUri: string } }> = [];
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
});
