import { useEffect } from "react";
import {
  absoluteUrl,
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  type SeoPage,
} from "./seo";

function upsertMeta(
  attr: "name" | "property",
  key: string,
  content: string,
): void {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function upsertJsonLd(id: string, data: unknown): void {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function removeJsonLd(id: string): void {
  document.getElementById(id)?.remove();
}

export function SeoHead({
  page,
  jsonLd,
}: {
  page: SeoPage;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}) {
  useEffect(() => {
    const url = absoluteUrl(page.path);
    document.title = page.title;
    upsertMeta("name", "description", page.description);
    if (page.keywords) upsertMeta("name", "keywords", page.keywords);
    upsertMeta("name", "robots", page.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
    upsertLink("canonical", url);

    upsertMeta("property", "og:type", page.type === "article" ? "article" : "website");
    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:title", page.title);
    upsertMeta("property", "og:description", page.description);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:image", DEFAULT_OG_IMAGE);
    upsertMeta("property", "og:locale", "en_US");

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", page.title);
    upsertMeta("name", "twitter:description", page.description);
    upsertMeta("name", "twitter:image", DEFAULT_OG_IMAGE);

    if (jsonLd) {
      const graph = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      upsertJsonLd("baltan-jsonld-page", graph.length === 1 ? graph[0] : { "@context": "https://schema.org", "@graph": graph });
    } else {
      removeJsonLd("baltan-jsonld-page");
    }
  }, [page, jsonLd]);

  return null;
}

export function siteWideJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/brand/baltan-icon-512.png`,
      description:
        "Explainable Redis and Valkey diagnosis with a read-only agent. Port 6379 stays private.",
      email: "hello@baltan.xyz",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
      description:
        "Redis / Valkey observability focused on diagnosis — big keys, missing TTLs, eviction, and slow commands.",
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web, Linux (Docker agent)",
      url: SITE_URL,
      description:
        "Explainable health and findings for Redis and Valkey. Read-only sidecar agent; key values never leave your network.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Closed pilot — book a demo",
      },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ];
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function articleJsonLd(page: SeoPage & { h1: string; intro: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.h1,
    description: page.description,
    mainEntityOfPage: absoluteUrl(page.path),
    author: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}
