import { useEffect, useMemo, useState } from "react";

const CALENDLY_ORIGINS = ["https://calendly.com", "https://assets.calendly.com"];

function ensureHint(rel: "preconnect" | "dns-prefetch", href: string) {
  const sel = `link[rel="${rel}"][href="${href}"]`;
  if (document.head.querySelector(sel)) return;
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  if (rel === "preconnect") link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

export function themedCalendlyUrl(base: string): string {
  const url = new URL(base);
  url.searchParams.set("hide_gdpr_banner", "1");
  url.searchParams.set("background_color", "070a0c");
  url.searchParams.set("text_color", "eef6f3");
  url.searchParams.set("primary_color", "1de9b6");
  return url.toString();
}

/** Warm Calendly origins early so “Pick a time” is not a cold start. */
export function prefetchCalendly(baseUrl: string): void {
  for (const origin of CALENDLY_ORIGINS) {
    ensureHint("dns-prefetch", origin);
    ensureHint("preconnect", origin);
  }
  try {
    const src = themedCalendlyUrl(baseUrl);
    if (!document.head.querySelector(`link[rel="prefetch"][href="${src}"]`)) {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = src;
      link.as = "document";
      document.head.appendChild(link);
    }
  } catch {
    /* ignore bad URL */
  }
}

export function CalendlyEmbed({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  const src = useMemo(() => themedCalendlyUrl(url), [url]);

  useEffect(() => {
    prefetchCalendly(url);
  }, [url]);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div className={`lp-calendly-wrap ${loaded ? "is-ready" : "is-loading"}`}>
      {!loaded ? (
        <div className="lp-calendly-skeleton" aria-busy="true" aria-live="polite">
          <div className="lp-calendly-spinner" aria-hidden="true" />
          <p className="lp-calendly-skel-title">Opening calendar…</p>
          <p className="lp-calendly-skel-hint">Usually a couple of seconds on first open.</p>
        </div>
      ) : null}
      <iframe
        title="Book a Baltan demo on Calendly"
        src={src}
        className="lp-calendly-frame"
        loading="eager"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
