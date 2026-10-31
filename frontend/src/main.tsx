import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { siteConfig } from "./config/site";

document.title = `${siteConfig.name} — ${siteConfig.tagline}`;
const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (favicon) favicon.href = siteConfig.logoIcon;
const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
if (description) description.content = siteConfig.description;

createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
