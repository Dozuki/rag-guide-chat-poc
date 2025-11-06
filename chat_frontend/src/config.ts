const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const RAW_DEFAULT_TOP_K = (import.meta.env.VITE_DEFAULT_TOP_K ?? "").trim();
const RAW_DEFAULT_TOKEN = (import.meta.env.VITE_DEFAULT_DOZUKI_TOKEN ?? "").trim();
const RAW_DOZUKI_BASE_URL = (import.meta.env.VITE_DOZUKI_BASE_URL ?? "").trim();

const normalizeUrl = (url: string) =>
  url.endsWith("/") ? url.slice(0, -1) : url;

export const API_BASE_URL = RAW_API_BASE_URL
  ? normalizeUrl(RAW_API_BASE_URL)
  : "";

export const SETTINGS_STORAGE_KEY = "rag-chat-settings";

export const DEFAULT_TOP_K = Number.parseInt(RAW_DEFAULT_TOP_K, 10) || 5;

export const DEFAULT_TOKEN = RAW_DEFAULT_TOKEN || undefined;

export const DOZUKI_BASE_URL = RAW_DOZUKI_BASE_URL
  ? normalizeUrl(RAW_DOZUKI_BASE_URL)
  : "";

export const resolveApiUrl = (path: string) =>
  API_BASE_URL ? `${API_BASE_URL}${path}` : path;
