import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ensureWebMkboardBridge } from "./lib/web-mkboard-bridge";
import "./styles/global.css";

void ensureWebMkboardBridge().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App initialPath={window.location.pathname} />
    </StrictMode>
  );
});
