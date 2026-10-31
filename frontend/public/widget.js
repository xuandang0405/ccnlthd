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
    .launcher{position:fixed;right:20px;bottom:20px;z-index:2147483647;display:flex;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;min-width:62px;height:62px;padding:10px 14px;border:1px solid #204da9;border-radius:0;background:#275ac7;color:white;box-shadow:0 4px 16px rgba(15,23,42,.14);font:600 14px/1.2 system-ui,sans-serif;text-align:left;cursor:pointer}
    .launcher svg{display:block;flex:none;width:34px;height:34px}
    .launcher-label{display:grid;gap:3px;white-space:nowrap}
    .launcher-label strong{font-size:14px;font-weight:700}
    .launcher-label span{font-size:11px;font-weight:500;color:#e5edff}
    .launcher:hover{background:#204da9}
    .launcher[aria-expanded="true"]{width:62px;padding:0;font-size:32px}
    .launcher:focus-visible{outline:3px solid #275ac7;outline-offset:4px}
    .panel{position:fixed;right:20px;bottom:90px;z-index:2147483646;width:min(380px,calc(100vw - 24px));height:min(620px,calc(100vh - 120px));border:1px solid #cbd4e2;border-radius:0;background:white;box-shadow:0 8px 32px rgba(15,23,42,.14);display:none}
    .panel.open{display:block}@media(max-width:520px){.panel{right:12px;bottom:82px;width:calc(100vw - 24px);height:calc(100vh - 100px)}.launcher{right:14px;bottom:14px}}
  `;
  const button = document.createElement("button");
  button.className = "launcher";
  button.type = "button";
  button.setAttribute("aria-label", "Mở trò chuyện với trợ lý AI - Trợ lý Việt");
  button.setAttribute("aria-expanded", "false");
  const botIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  botIcon.setAttribute("viewBox", "0 0 32 32");
  botIcon.setAttribute("fill", "none");
  botIcon.setAttribute("stroke", "currentColor");
  botIcon.setAttribute("stroke-width", "2");
  botIcon.setAttribute("aria-hidden", "true");
  botIcon.setAttribute("focusable", "false");
  botIcon.innerHTML = `
    <path d="M16 8V3h-4M5 14H2v7h3m22-7h3v7h-3" />
    <path d="M5 8h22v18h-7l-4 4v-4H5V8Z" />
    <path d="M10 13h3v4h-3zm9 0h3v4h-3z" fill="currentColor" stroke="none" />
    <path d="M11 21h10" />
  `;
  const buttonLabel = document.createElement("span");
  buttonLabel.className = "launcher-label";
  const buttonTitle = document.createElement("strong");
  buttonTitle.textContent = "Trợ lý AI";
  const buttonHint = document.createElement("span");
  buttonHint.textContent = "Chat tư vấn";
  buttonLabel.append(buttonTitle, buttonHint);
  button.append(botIcon, buttonLabel);
  const frame = document.createElement("iframe");
  frame.className = "panel";
  frame.title = "Trợ lý Việt";
  frame.allow = "clipboard-write";
  frame.src = `${base}/widget/${encodeURIComponent(chatbotId)}?parentOrigin=${encodeURIComponent(location.origin)}`;
  button.addEventListener("click", () => {
    const open = frame.classList.toggle("open");
    button.setAttribute("aria-label", open ? "Đóng Trợ lý Việt" : "Mở trò chuyện với trợ lý AI - Trợ lý Việt");
    button.setAttribute("aria-expanded", String(open));
    if (open) button.replaceChildren(document.createTextNode("×"));
    else button.replaceChildren(botIcon, buttonLabel);
  });
  shadow.append(style, frame, button);
  document.body.append(host);
})();
