import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { MemoryRouter } = require("react-router-dom");
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const modules = new Map();

test("widget test page uses its own origin and requires a valid public chatbot ID", () => {
  const html = readFileSync(new URL("../public/widget-test.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const chatbotId = "667b99a1-c812-496f-a39a-22c04974b13f";

  function runPage(search) {
    const nodes = { "test-instructions": {}, "embed-code": {} };
    const appended = [];
    runInNewContext(script, {
      URL,
      URLSearchParams,
      location: { origin: "http://127.0.0.1:8080", search },
      document: {
        getElementById: (id) => nodes[id],
        createElement: () => ({ dataset: {} }),
        body: { appendChild: (element) => appended.push(element) },
      },
    });
    return { nodes, appended };
  }

  const valid = runPage(`?chatbotId=${chatbotId}`);
  assert.equal(valid.appended[0].src, "http://127.0.0.1:8080/widget.js");
  assert.equal(valid.appended[0].dataset.chatbotId, chatbotId);
  assert.match(valid.nodes["embed-code"].textContent, /http:\/\/127\.0\.0\.1:8080\/widget\.js/);
  assert.equal(runPage("").appended.length, 0);
  assert.equal(runPage("?chatbotId=not-a-public-id").appended.length, 0);
});

function loadComponent(relativePath) {
  const path = resolve(sourceRoot, relativePath);
  if (modules.has(path)) return modules.get(path).exports;
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const componentModule = { exports: {} };
  modules.set(path, componentModule);
  const importModule = (name) => {
    if (!name.startsWith(".")) return require(name);
    const base = resolve(dirname(path), name);
    const dependency = [base, base + ".ts", base + ".tsx"].find(existsSync);
    if (!dependency) throw new Error("Missing component: " + name);
    if (dependency.endsWith(".png")) return { default: dependency };
    return loadComponent(dependency);
  };
  new Function("require", "module", "exports", compiled)(importModule, componentModule, componentModule.exports);
  return componentModule.exports;
}

const { WorkspaceLayout } = loadComponent("components/WorkspaceLayout.tsx");
const { AssistantContent } = loadComponent("components/AssistantContent.tsx");
const { LoadingState, ErrorState, EmptyState } = loadComponent("components/Feedback.tsx");
const { customerNavigation, adminNavigation, siteConfig } = loadComponent("config/site.ts");
const { Brand } = loadComponent("components/Brand.tsx");
const { LeadNotificationLink } = loadComponent("components/LeadNotificationLink.tsx");

test("web notification link shows the actual new lead count and honest loading or error states", () => {
  const render = (props) => renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(LeadNotificationLink, props)));
  const loaded = render({ count: 7, loading: false, failed: false });
  assert.match(loaded, /7 khách hàng mới chờ xử lý/);
  assert.match(loaded, /href="\/app\?view=settings"/);
  assert.match(loaded, /aria-live="polite"/);
  assert.match(render({ count: undefined, loading: true, failed: false }), /Đang tải thông báo/);
  assert.match(render({ count: 7, loading: false, failed: true }), /Không tải được thông báo/);
});

test("web notification source removes bot setup and uses existing tenant-scoped APIs", () => {
  const source = readFileSync(resolve(sourceRoot, "pages/customer/SettingsViews.tsx"), "utf8");
  const hook = readFileSync(resolve(sourceRoot, "hooks/useCustomerWorkspace.ts"), "utf8");
  assert.match(source, /Chưa có khách hàng mới chờ xử lý/);
  assert.match(source, /Đánh dấu đã liên hệ/);
  assert.match(source, /15 giây/);
  assert.match(source, /không phải số tin nhắn chưa đọc/);
  assert.match(hook, /\/leads\?status=NEW&page=1&page_size=5/);
  assert.match(hook, /queryKey: \["new-leads", organizationId\]/);
  assert.doesNotMatch(source + hook, /Telegram|Chat ID|Gửi mã|\/telegram/);
});

test("brand uses original full and icon images without duplicating the name next to the full logo", () => {
  assert.equal(siteConfig.name, "Trợ lý Việt");
  assert.equal(siteConfig.slogan, '"Khách không phải người yêu, nhưng phải được chiều"');
  assert.equal(siteConfig.logoFull, resolve(sourceRoot, "../img/logo.png"));
  assert.equal(siteConfig.logoIcon, resolve(sourceRoot, "../img/logo-2.png"));
  const renderBrand = (variant) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Brand, { variant })));
  assert.match(renderBrand("full"), /img[^>]*logo\.png/);
  assert.doesNotMatch(renderBrand("full"), />Trợ lý Việt</);
  assert.match(renderBrand("icon"), /img[^>]*logo-2\.png/);
  assert.match(renderBrand("responsive"), /source media="\(max-width: 1023px\)"/);
  assert.match(renderWorkspace(customerNavigation), /logo\.png/);
  assert.match(renderWorkspace(adminNavigation, true), /logo\.png/);
});

test("standalone widget identifies AI chat without an image request and retains its iframe URL and open-close behavior", () => {
  const elements = [];
  const createElement = (tagName) => {
    const element = {
      tagName, children: [], attributes: {}, classes: new Set(), handlers: {},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      attachShadow() { return createElement("shadow"); },
      classList: { toggle(name) { if (element.classes.has(name)) { element.classes.delete(name); return false; } element.classes.add(name); return true; } },
    };
    elements.push(element);
    return element;
  };
  const script = { src: "https://example.com/widget.js", dataset: { chatbotId: "test-chatbot" } };
  const document = { currentScript: script, body: createElement("body"), createElement, createElementNS: (_namespace, tagName) => createElement(tagName), createTextNode: (text) => text };
  runInNewContext(readFileSync(resolve(sourceRoot, "../public/widget.js"), "utf8"), { document, URL, location: { origin: "https://shop.example.com" } });
  const button = elements.find(element => element.tagName === "button");
  const frame = elements.find(element => element.tagName === "iframe");
  const icon = elements.find(element => element.tagName === "svg");
  const label = elements.find(element => element.className === "launcher-label");
  assert.ok(icon, "launcher has an inline robot icon");
  assert.equal(icon.attributes["aria-hidden"], "true");
  assert.equal(icon.attributes.focusable, "false");
  assert.ok(!elements.some(element => element.tagName === "img"));
  assert.equal(label.children[0].textContent, "Trợ lý AI");
  assert.equal(label.children[1].textContent, "Chat tư vấn");
  assert.equal(frame.src, "https://example.com/widget/test-chatbot?parentOrigin=https%3A%2F%2Fshop.example.com");
  assert.equal(button.children[0], icon);
  assert.equal(button.children[1], label);
  assert.match(button.attributes["aria-label"], /trợ lý AI/);
  assert.equal(button.attributes["aria-expanded"], "false");
  button.handlers.click();
  assert.equal(button.attributes["aria-expanded"], "true");
  assert.equal(button.children[0], "×");
  assert.equal(button.children.length, 1);
  assert.ok(frame.classes.has("open"));
  button.handlers.click();
  assert.equal(button.attributes["aria-expanded"], "false");
  assert.equal(button.children[0], icon);
  assert.equal(button.children[1], label);
  assert.ok(!frame.classes.has("open"));
});

function renderWorkspace(navigation, admin = false) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(WorkspaceLayout, {
      navigation, activeId: admin ? "tickets" : "chatbots",
      workspaceName: "Workspace", userName: "Test", userEmail: "test@example.com",
      admin, unreadTickets: 2, onLogout: async () => {},
    }, React.createElement("h1", null, "Nội dung trang"))
  ));
}

test("customer workspace preserves all ten existing navigation destinations", () => {
  assert.equal(customerNavigation.length, 10);
  assert.equal(new Set(customerNavigation.map(item => item.id)).size, 10);
  const html = renderWorkspace(customerNavigation);
  for (const item of customerNavigation) {
    assert.ok(html.includes(item.label.replaceAll("&", "&amp;")), item.id);
    assert.ok(html.includes(item.href.replaceAll("&", "&amp;")), item.href);
  }
  assert.match(html, /aria-current="page"/);
  assert.match(html, /aria-controls="workspace-navigation"/);
  assert.match(html, /Đăng xuất/);
  assert.match(html, /Đến nội dung chính/);
});

test("admin workspace retains eight sections and unread support indicator", () => {
  assert.equal(adminNavigation.length, 8);
  const html = renderWorkspace(adminNavigation, true);
  for (const item of adminNavigation) assert.ok(html.includes(item.label), item.id);
  assert.match(html, /2 yêu cầu chưa đọc/);
  assert.match(html, /Quản trị viên/);
});

test("assistant answer highlights prices and emphasis without rendering HTML", () => {
  const html = renderToStaticMarkup(React.createElement(AssistantContent, {
    content: "## Sản phẩm\n- **Giá bán**: 200.000 VND\n<script>alert(1)</script>",
  }));
  assert.match(html, /<h4/);
  assert.match(html, /price-highlight/);
  assert.match(html, /<strong[^>]*>Giá bán<\/strong>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("loading and errors expose accessible feedback and retry action", () => {
  assert.match(renderToStaticMarkup(React.createElement(LoadingState)), /role="status"/);
  const html = renderToStaticMarkup(React.createElement(ErrorState, { message: "Không kết nối", onRetry: () => {} }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Thử lại/);
  assert.match(renderToStaticMarkup(React.createElement(EmptyState, { title: "Chưa có dữ liệu", description: "Thêm tài liệu để bắt đầu." })), /Chưa có dữ liệu/);
});
