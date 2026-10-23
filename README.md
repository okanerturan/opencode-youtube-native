# opencode-youtube-native

Native YouTube video understanding inside OpenCode. Paste a link, and Gemini watches the frames and listens to the audio. No `yt-dlp`, no Whisper, no extra API key.

## Install

```sh
opencode plugin add github:okanerturan/opencode-youtube-native
```

That installs the plugin, pins the revision, and writes it to your global config. Check it with:

```sh
opencode plugin list
```

Update later:

```sh
opencode plugin update github:okanerturan/opencode-youtube-native
```

Remove:

```sh
opencode plugin remove github:okanerturan/opencode-youtube-native
```

If the plugin does not show up, run `opencode service restart`.

## Usage

1. Select a Gemini model. `Gemini 4 Argon Contributor` on OpenCode Go works, and so do the other native Google routes such as `Gemini 3.8 Flash`.
2. Paste a public YouTube link in your prompt:

```text
https://www.youtube.com/watch?v=pyRSiLuOCp4

Explain the lessons, what is on the slide at 08:10, and read between the lines.
```

3. Gemini answers from the actual video: slides, screen content, audio, and timestamps.

Supported link shapes: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, and `youtube.com/live/`. All of them are canonicalized before sending.

## How it works

OpenCode sends a pasted URL as plain text, so Gemini never sees a video. This plugin hooks `ctx.session.hook("http.request")` and, just before the request leaves OpenCode, adds Gemini's native multimodal part to the newest user turn:

```json
{
  "fileData": {
    "mimeType": "video/mp4",
    "fileUri": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  }
}
```

Google's backend then streams the video directly from YouTube into the model context. That is the same path Google AI Studio uses.

The hook only runs on the primary agent loop. Titles and compaction are skipped, and a video is never attached twice.

## Models and routes

Works on models served through the native Google endpoint:

- `opencode-go` (OpenCode Go), for example Argon Contributor
- `opencode` (Default / OpenCode), if your Console account has credits
- Google AI Studio or Vertex, though Vertex cannot fetch YouTube URLs

Does not work on:

- Cloudflare AI Gateway. It uses its own provider package and a gateway URL, so the hook does not match yet.
- Non-Gemini models. Claude, GPT, DeepSeek, and Grok use OpenAI-style bodies and never carry `fileData`.

## Cost

Video is billed as input tokens. A 19 minute video is roughly 160k tokens, mostly 1fps frames plus audio. The same video costs about $0.64 on Argon via Go, $0.32 on Argon via `opencode`, and $0.24 on Gemini 3.8 Flash.

Two things to keep in mind:

- Every request in a turn carries the video again, so long agent turns get expensive. Keep turns short.
- Clip long videos when you only care about a section. Token cost scales with duration.

## License

MIT
