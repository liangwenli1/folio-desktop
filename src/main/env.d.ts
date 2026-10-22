// Set when the installer is built: the address of the Folio deployment (e.g. https://folio.example.com).
interface ImportMetaEnv { readonly MAIN_VITE_FOLIO_URL?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
