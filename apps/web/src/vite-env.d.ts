/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_TOKEN?: string;
  readonly VITE_CALENDLY_URL?: string;
  readonly VITE_AGENT_IMAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

