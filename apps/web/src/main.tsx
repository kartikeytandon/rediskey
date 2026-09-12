import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Landing } from "./Landing";
import {
  NotFoundPage,
  PrivacyPage,
  ProblemGuide,
  SetupPage,
  TermsPage,
} from "./MarketingPages";
import { SeoHead } from "./SeoHead";
import { APP_SEO, findProblemPage } from "./seo";
import "./styles.css";
import "./landing.css";

function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/$/, "") || "/");
  useEffect(() => {
    const onNav = () => setPath(window.location.pathname.replace(/\/$/, "") || "/");
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);
  return path;
}

function Root() {
  const path = usePath();

  if (path.startsWith("/app")) {
    return (
      <>
        <SeoHead page={APP_SEO} />
        <App />
      </>
    );
  }

  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/terms") return <TermsPage />;
  if (path === "/setup") return <SetupPage />;

  const problem = findProblemPage(path);
  if (problem) return <ProblemGuide page={problem} />;

  if (path === "/" || path === "") return <Landing />;

  return <NotFoundPage />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
