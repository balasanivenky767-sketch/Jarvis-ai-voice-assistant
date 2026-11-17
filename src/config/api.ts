const STORAGE_KEY = "jarvis_server_url";

// Default remote backend URL when running inside the standalone Android APK
export const DEFAULT_APK_BACKEND_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://ais-pre-2yb4lgo24ndvveybhpgs6t-945152450496.asia-southeast1.run.app";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
    return true;
  }
  if (window.location.protocol === "capacitor:" || window.location.protocol === "file:") {
    return true;
  }
  // Capacitor Android defaults to https://localhost (no port)
  if (window.location.hostname === "localhost" && !window.location.port) {
    return true;
  }
  return false;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getServerUrl(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && stored.trim()) {
    return normalizeBaseUrl(stored);
  }
  if (isNativeApp()) {
    return normalizeBaseUrl(DEFAULT_APK_BACKEND_URL);
  }
  return "";
}

export function setServerUrl(url: string): void {
  if (typeof window === "undefined") return;
  const cleaned = normalizeBaseUrl(url);
  if (cleaned) {
    window.localStorage.setItem(STORAGE_KEY, cleaned);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = getServerUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}

export function wsUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = getServerUrl();
  if (base) {
    const wsBase = base.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");
    return `${wsBase}${normalizedPath}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${normalizedPath}`;
}
