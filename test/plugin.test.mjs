import assert from "node:assert/strict";
import plugin from "../src/index.js";

function fakeCtx() {
  let hook;
  return {
    ctx: {
      session: {
        hook: async (_name, cb) => {
          hook = cb;
        },
      },
    },
    get hook() {
      return hook;
    },
  };
}

function geminiRequest(contents) {
  return new Request("https://opencode.ai/inference/go/google/v1beta/models/gemini-4-argon:streamGenerateContent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents }),
  });
}

function textParts(body) {
  return body.contents.flatMap((c) => (c.parts ?? []).filter((p) => typeof p.text === "string").map((p) => p.text));
}

const harness = fakeCtx();
await plugin.setup(harness.ctx);
assert.equal(typeof harness.hook, "function", "hook registered");

// 1. attaches once, on the user turn that carries the link
{
  const event = {
    kind: "primary",
    request: geminiRequest([
      { role: "user", parts: [{ text: "watch https://youtu.be/dQw4w9WgXcQ and explain" }] },
      { role: "model", parts: [{ text: "One moment" }] },
      { role: "user", parts: [{ functionResponse: { name: "shell", response: {} } }] },
    ]),
  };
  await harness.hook(event);
  const body = JSON.parse(await event.request.text());
  const files = body.contents.flatMap((c) => (c.parts ?? []).filter((p) => p.fileData));
  assert.equal(files.length, 1, "one video attached");
  assert.equal(files[0].fileData.fileUri, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(body.contents[0].parts[0].fileData.fileUri, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(body.contents[2].parts.length, 1, "tool turn untouched");
}

// 2. does not run for title or compaction requests
for (const kind of ["title", "compaction", "generate"]) {
  const event = {
    kind,
    request: geminiRequest([{ role: "user", parts: [{ text: "https://youtu.be/dQw4w9WgXcQ" }] }]),
  };
  await harness.hook(event);
  const body = JSON.parse(await event.request.text());
  assert.equal(
    body.contents.flatMap((c) => (c.parts ?? []).filter((p) => p.fileData)).length,
    0,
    `no attach for ${kind}`
  );
}

// 3. leaves non-Google providers alone
{
  const event = {
    kind: "primary",
    request: new Request("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "https://youtu.be/dQw4w9WgXcQ" }] }] }),
    }),
  };
  const before = await event.request.clone().text();
  await harness.hook(event);
  assert.equal(await event.request.text(), before, "non-google request unchanged");
}

// 4. no link, no rewrite
{
  const event = {
    kind: "primary",
    request: geminiRequest([{ role: "user", parts: [{ text: "just a normal question" }] }]),
  };
  const before = await event.request.clone().text();
  await harness.hook(event);
  const after = await event.request.text();
  assert.equal(after, before, "request unchanged without a link");
  assert.deepEqual(textParts(JSON.parse(after)), ["just a normal question"]);
}

// 5. duplicate link in history is not attached twice
{
  const event = {
    kind: "primary",
    request: geminiRequest([
      {
        role: "user",
        parts: [
          { fileData: { mimeType: "video/mp4", fileUri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
          { text: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
        ],
      },
    ]),
  };
  await harness.hook(event);
  const body = JSON.parse(await event.request.text());
  const files = body.contents.flatMap((c) => (c.parts ?? []).filter((p) => p.fileData));
  assert.equal(files.length, 1, "still one video");
}

// 6. shorts and live links canonicalize
for (const [input, expected] of [
  ["https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  ["https://www.youtube.com/live/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
]) {
  const event = {
    kind: "primary",
    request: geminiRequest([{ role: "user", parts: [{ text: input }] }]),
  };
  await harness.hook(event);
  const body = JSON.parse(await event.request.text());
  assert.equal(body.contents[0].parts[0].fileData.fileUri, expected, input);
}

console.log("all checks passed");
