import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourcePath = fileURLToPath(new URL("../src/services/api.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8").replace(
  "import.meta.env.VITE_API_BASE_URL",
  '"/api"'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { ApiError, api, configureApi, getLastRequestId, uploadApi } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("API sends tenant authorization and JSON request body", async (t) => {
  configureApi("access-token", "org-123");
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "/api/v1/chatbots");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.get("Authorization"), "Bearer access-token");
    assert.equal(init.headers.get("X-Organization-ID"), "org-123");
    assert.equal(init.headers.get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(init.body), { name: "Trợ lý A" });
    return Response.json({ id: "bot-1" }, { status: 201 });
  });

  assert.deepEqual(await api("/chatbots", { method: "POST", body: { name: "Trợ lý A" } }), {
    id: "bot-1",
  });
  configureApi(null, null);
});

test("API exposes validation errors and request ID for support", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { detail: [{ loc: ["body", "email"], msg: "Email không hợp lệ", type: "value_error" }] },
      { status: 422, headers: { "X-Request-ID": "req-422" } }
    )
  );

  await assert.rejects(api("/auth/login", { method: "POST", body: {} }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 422);
    assert.equal(error.requestId, "req-422");
    assert.equal(error.validationErrors[0].loc.at(-1), "email");
    return true;
  });
  assert.equal(getLastRequestId(), "req-422");
});

test("API reports an HTML response instead of crashing on JSON parsing", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response("<!DOCTYPE html>", { status: 200, headers: { "Content-Type": "text/html" } })
  );

  await assert.rejects(api("/dashboard/summary"), /Máy chủ trả về nội dung không hợp lệ/);
});

test("upload sends FormData without forcing a JSON content type", async (t) => {
  configureApi("access-token", "org-123");
  const form = new FormData();
  form.append("file", new Blob(["sample"]), "sample.txt");
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init.headers.get("Content-Type"), null);
    assert.equal(init.headers.get("Authorization"), "Bearer access-token");
    assert.equal(init.body, form);
    return Response.json({ id: "document-1" });
  });

  assert.deepEqual(await uploadApi("/documents", form), { id: "document-1" });
  configureApi(null, null);
});
