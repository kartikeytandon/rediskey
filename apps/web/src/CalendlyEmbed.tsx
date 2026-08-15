import { useEffect, useRef } from "react";

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget: (opts: { url: string; parentElement: HTMLElement }) => void;
    };
  }
}

const SCRIPT = "https://assets.calendly.com/assets/external/widget.js";

function themedUrl(base: string): string {
  const url = new URL(base);
  url.searchParams.set("hide_gdpr_banner", "1");
  url.searchParams.set("background_color", "0c1017");
  url.searchParams.set("text_color", "eef3fb");
  url.searchParams.set("primary_color", "5b9fd6");
  return url.toString();
}

export function CalendlyEmbed({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || !url) return;
    el.innerHTML = "";
    const src = themedUrl(url);

    const boot = () => {
      window.Calendly?.initInlineWidget({ url: src, parentElement: el });
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (window.Calendly) {
      boot();
      return;
    }
    if (existing) {
      existing.addEventListener("load", boot);
      return () => existing.removeEventListener("load", boot);
    }

    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = boot;
    document.body.appendChild(script);
  }, [url]);

  return <div ref={host} className="lp-calendly" />;
}
