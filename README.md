# opencode-youtube-native

Native **Google AI Studio–style YouTube video + audio + visual frame understanding** inside [OpenCode](https://opencode.ai) — using your existing **OpenCode Go**, **OpenCode Zen**, or **Google Gemini** model, with **zero external API keys, zero `yt-dlp`, and zero Whisper**.

## How it works

When you paste a YouTube link into OpenCode while using a Gemini model (like **Gemini 4 Argon** on OpenCode Go, or Gemini 3.7 Flash / 3.1 Pro), OpenCode normally sends the URL as a plain text string (`{ text: "https://www.youtube.com/watch?v=..." }`), so the model can't see or hear the video.

However, OpenCode Go & Zen route Gemini models through the native `@opencode/ai/providers/google` (`v1beta`) endpoint.

This tiny OpenCode V2 plugin uses `ctx.session.hook("http.request")` to detect YouTube URLs (`youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...`, `youtube.com/live/...`) in your user prompt and injects Gemini's native `fileData.fileUri` multimodal block right into `contents[].parts` before the request leaves OpenCode:

```json
{
  "fileData": {
    "mimeType": "video/mp4",
    "fileUri": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  }
}
```

Google's backend then streams the actual **video frames + audio track** directly from YouTube into Gemini's 1M context window — so Gemini can read slides on screen, inspect UI demos, hear tone of voice, and reference exact timestamps without downloading anything locally.

## Install

### Option 1: Drop-in single file (Global)

Copy `src/index.js` into your global OpenCode plugins folder:

```bash
mkdir -p ~/.config/opencode/plugins
curl -fsSL https://raw.githubusercontent.com/okturan/opencode-youtube-native/main/src/index.js \
  -o ~/.config/opencode/plugins/opencode-youtube-native.js
```

OpenCode hot-reloads `~/.config/opencode/plugins/` automatically — no restart required.

### Option 2:Via `opencode.jsonc`

Add the package or path to your `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "opencode-youtube-native"
  ]
}
```

## Usage

1. Select any Gemini model in OpenCode (e.g. `Gemini 4 Argon` on **OpenCode Go**).
2. Paste any public YouTube URL in your prompt:
   ```text
   https://www.youtube.com/watch?v=pyRSiLuOCp4
   Explain the lessons, what's on the slides at 08:10, and read between the lines.
   ```
3. Gemini natively watches and listens to the video (frames + audio) and answers directly.

## License

MIT
