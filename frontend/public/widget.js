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
    .launcher{position:fixed;right:20px;bottom:20px;z-index:2147483647;width:58px;height:58px;border:0;border-radius:50%;background:#2563eb;color:white;box-shadow:0 12px 35px rgba(15,23,42,.28);font:700 24px system-ui;cursor:pointer}
    .panel{position:fixed;right:20px;bottom:90px;z-index:2147483646;width:min(380px,calc(100vw - 24px));height:min(620px,calc(100vh - 120px));border:0;border-radius:20px;background:white;box-shadow:0 24px 70px rgba(15,23,42,.3);display:none}
    .panel.open{display:block}@media(max-width:520px){.panel{right:12px;bottom:82px;width:calc(100vw - 24px);height:calc(100vh - 100px)}.launcher{right:14px;bottom:14px}}
  `;
  const button = document.createElement("button");
  button.className = "launcher";
  button.type = "button";
  button.setAttribute("aria-label", "Mở trợ lý AI");
  button.textContent = "✦";
  const frame = document.createElement("iframe");
  frame.className = "panel";
  frame.title = "Trợ lý AI";
  frame.allow = "clipboard-write";
  frame.src = `${base}/widget/${encodeURIComponent(chatbotId)}?parentOrigin=${encodeURIComponent(location.origin)}`;
  button.addEventListener("click", () => {
    const open = frame.classList.toggle("open");
    button.setAttribute("aria-label", open ? "Đóng trợ lý AI" : "Mở trợ lý AI");
    button.textContent = open ? "×" : "✦";
  });
  shadow.append(style, frame, button);
  document.body.append(host);
})();
