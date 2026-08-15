/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_TOKEN?: string;
  readonly VITE_CALENDLY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

