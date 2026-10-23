(() => {
  const script = document.currentScript;
  const chatbotId = script?.dataset.chatbotId;
  if (!script || !chatbotId || script.dataset.loaded === "true") return;
  script.dataset.loaded = "true";

  const base = new URL(script.src).origin;
  const host = document.createElement("div");
  host.setAttribute("data-ai-sales-widget", chatbotId);
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    .launcher{position:fixed;right:20px;bottom:20px;z-index:2147483647;display:flex;align-items:center;justify-content:center;width:58px;height:58px;border:1px solid #204da9;border-radius:0;background:white;color:#275ac7;box-shadow:0 4px 16px rgba(15,23,42,.14);font:700 24px system-ui;cursor:pointer}
    .launcher img{display:block;width:44px;height:44px;object-fit:contain;border-radius:0}
    .launcher:focus-visible{outline:3px solid #275ac7;outline-offset:4px}
    .panel{position:fixed;right:20px;bottom:90px;z-index:2147483646;width:min(380px,calc(100vw - 24px));height:min(620px,calc(100vh - 120px));border:1px solid #cbd4e2;border-radius:0;background:white;box-shadow:0 8px 32px rgba(15,23,42,.14);display:none}
    .panel.open{display:block}@media(max-width:520px){.panel{right:12px;bottom:82px;width:calc(100vw - 24px);height:calc(100vh - 100px)}.launcher{right:14px;bottom:14px}}
  `;
  const button = document.createElement("button");
  button.className = "launcher";
  button.type = "button";
  button.setAttribute("aria-label", "Mở Trợ lý Việt");
  button.setAttribute("aria-expanded", "false");
  const brandIcon = document.createElement("img");
  brandIcon.src = `${base}/img/logo-2.png`;
  brandIcon.alt = "";
  brandIcon.width = 394;
  brandIcon.height = 422;
  button.append(brandIcon);
  const frame = document.createElement("iframe");
  frame.className = "panel";
  frame.title = "Trợ lý Việt";
  frame.allow = "clipboard-write";
  frame.src = `${base}/widget/${encodeURIComponent(chatbotId)}?parentOrigin=${encodeURIComponent(location.origin)}`;
  button.addEventListener("click", () => {
    const open = frame.classList.toggle("open");
    button.setAttribute("aria-label", open ? "Đóng Trợ lý Việt" : "Mở Trợ lý Việt");
    button.setAttribute("aria-expanded", String(open));
    button.replaceChildren(open ? document.createTextNode("×") : brandIcon);
  });
  shadow.append(style, frame, button);
  document.body.append(host);
})();
