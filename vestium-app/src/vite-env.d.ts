/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_STUDIO?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
  readonly VITE_PLAUSIBLE_SRC?: string;
  readonly VITE_OPENALEX_API_KEY?: string;
  readonly VITE_SEMANTICSCHOLAR_API_KEY?: string;
  readonly VITE_NVD_API_KEY?: string;
  readonly VITE_OPENFDA_API_KEY?: string;
  readonly VITE_GOOGLE_FACTCHECK_API_KEY?: string;
  readonly VITE_UNSPLASH_API_KEY?: string;
  readonly VITE_PEXELS_API_KEY?: string;
  readonly VITE_PIXABAY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
