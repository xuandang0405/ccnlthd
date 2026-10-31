import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/services/chatRetry.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { pendingChatMessage, postChatMessage } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

function fastBackoff(t) {
  const originalTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (callback, delay, ...args) =>
    originalTimeout(callback, delay >= 60_000 ? delay : 0, ...args)
  );
}

test("manual retry keeps its message ID; new content or visitor gets a new ID", () => {
  const pending = pendingChatMessage(null, "Giá sản phẩm?", "visitor-a");
  assert.equal(pendingChatMessage(pending, "Giá sản phẩm?", "visitor-a"), pending);
  assert.notEqual(pendingChatMessage(pending, "Câu hỏi khác", "visitor-a").client_message_id, pending.client_message_id);
  assert.notEqual(pendingChatMessage(pending, "Giá sản phẩm?", "visitor-b").client_message_id, pending.client_message_id);
});

test("HTTP LAN fallback creates a valid UUID v4 without randomUUID", (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis.crypto, "randomUUID");
  Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis.crypto, "randomUUID", original);
    else delete globalThis.crypto.randomUUID;
  });
  const pending = pendingChatMessage(null, "Xin chào", "visitor-a");
  assert.match(pending.client_message_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

for (const failure of ["network", "503", "busy"]) {
  test(`chat retries ${failure} with exactly the same payload`, async (t) => {
    fastBackoff(t);
    const bodies = [];
    t.mock.method(globalThis, "fetch", async (url, init) => {
      assert.equal(url, "/chat/messages");
      assert.equal(init.headers["X-Visitor-Token"], "visitor-a");
      bodies.push(init.body);
      if (bodies.length === 1) {
        if (failure === "network") throw new TypeError("Failed to fetch");
        if (failure === "busy") return Response.json({}, { status: 409, headers: { "Retry-After": "1" } });
        return Response.json({}, { status: 503 });
      }
      return Response.json({ reply: "Đã trả lời" });
    });
    const pending = pendingChatMessage(null, "Xin chào", "visitor-a");
    const result = await postChatMessage("/chat/messages", pending);
    assert.equal(result.status, 200);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    assert.equal(JSON.parse(bodies[0]).client_message_id, pending.client_message_id);
  });
}

for (const status of [401, 402, 409, 422, 429]) {
  test(`chat does not automatically retry HTTP ${status}`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return Response.json({}, { status });
    });
    const result = await postChatMessage("/chat/messages", pendingChatMessage(null, "Hỏi giá", "v"));
    assert.equal(result.status, status);
    assert.equal(calls, 1);
  });
}

test("network retries stop after three attempts and keep the pending ID", async (t) => {
  fastBackoff(t);
  const pending = pendingChatMessage(null, "Hỏi lại", "v");
  const bodies = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    bodies.push(init.body);
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(postChatMessage("/chat/messages", pending));
  assert.equal(bodies.length, 3);
  assert.equal(new Set(bodies).size, 1);
  assert.equal(pendingChatMessage(pending, "Hỏi lại", "v"), pending);
});

test("response timeout aborts each attempt and never creates another message ID", async (t) => {
  const originalTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (callback, _delay, ...args) =>
    originalTimeout(callback, 0, ...args)
  );
  const bodies = [];
  t.mock.method(globalThis, "fetch", (_url, init) => new Promise((_resolve, reject) => {
    bodies.push(init.body);
    init.signal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
  }));
  await assert.rejects(
    postChatMessage("/chat/messages", pendingChatMessage(null, "Xin chào", "v")),
    /Máy chủ phản hồi quá lâu/
  );
  assert.equal(bodies.length, 3);
  assert.equal(new Set(bodies).size, 1);
});
