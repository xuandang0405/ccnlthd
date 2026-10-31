import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sourcePath = fileURLToPath(new URL("../src/components/QuotaMeter.tsx", import.meta.url));
const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const componentModule = { exports: {} };
new Function("require", "module", "exports", compiled)(
  require,
  componentModule,
  componentModule.exports
);
const { QuotaMeter } = componentModule.exports;

test("quota component shows a warning when credits are nearly exhausted", () => {
  const html = renderToStaticMarkup(React.createElement(QuotaMeter, { remaining: 3 }));
  assert.match(html, /Bạn còn 3 lượt miễn phí/);
  assert.match(html, /role="status"/);
});

test("quota component never displays a negative balance", () => {
  const html = renderToStaticMarkup(React.createElement(QuotaMeter, { remaining: -2 }));
  assert.match(html, /Đã hết lượt miễn phí/);
  assert.doesNotMatch(html, />-2</);
});

test("quota component renders the current plan and upgrade action", () => {
  const html = renderToStaticMarkup(
    React.createElement(QuotaMeter, { remaining: 20, planName: "FREE", onUpgradeClick: () => {} })
  );
  assert.match(html, /Gói hiện tại: FREE/);
  assert.match(html, /Mua thêm lượt/);
  assert.doesNotMatch(html, /role="status"/);
});
