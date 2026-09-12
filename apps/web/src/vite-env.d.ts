/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_TOKEN?: string;
  readonly VITE_CALENDLY_URL?: string;
  readonly VITE_AGENT_IMAGE?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_GOOGLE_SITE_VERIFICATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

