/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Display currency (ISO 4217 code, e.g. "CAD"). Injected at build time by
   * vite.config.ts from the root .env (`CURRENCY`); defaults to "USD".
   */
  readonly CURRENCY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
