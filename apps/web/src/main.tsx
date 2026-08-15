import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Landing } from "./Landing";
import "./styles.css";
import "./landing.css";

function Root() {
  const path = window.location.pathname;
  if (path.startsWith("/app")) return <App />;
  return <Landing />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
