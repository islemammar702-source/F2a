// HTTP client. The access token lives only in memory (never in localStorage);
// the refresh token is an httpOnly cookie handled by the browser and rotated by the API.

export class ApiError extends Error {
  status: number;
  code: string;
  errors?: { field: string; message: string }[];
  constructor(status: number, code: string, errors?: { field: string; message: string }[]) {
    super(code);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;
let onTokenRefreshed: ((data: TokenResponse) => void) | null = null;

export type TokenResponse = { access_token: string; expires_in: number; user: import("./types").Me };

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function setSessionHandlers(lost: () => void, refreshed: (d: TokenResponse) => void) {
  onSessionLost = lost;
  onTokenRefreshed = refreshed;
}

let inflightRefresh: Promise<TokenResponse | null> | null = null;

/** Single-flight: concurrent callers share one rotation (a refresh token is single-use). */
export function refreshSession(): Promise<TokenResponse | null> {
  if (!inflightRefresh) {
    inflightRefresh = fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as TokenResponse;
        accessToken = data.access_token;
        return data;
      })
      .finally(() => setTimeout(() => (inflightRefresh = null), 0));
  }
  return inflightRefresh;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = refreshSession()
      .then((d) => {
        if (d) onTokenRefreshed?.(d);
        return !!d;
      })
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0));
  }
  return refreshing;
}

type Opts = { method?: string; body?: unknown; query?: Record<string, unknown>; raw?: boolean; form?: FormData };

function buildUrl(path: string, query?: Record<string, unknown>) {
  const url = new URL(`/api${path}`, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function doFetch(path: string, opts: Opts): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return fetch(buildUrl(path, opts.query), { method: opts.method ?? "GET", headers, body, credentials: "same-origin" });
}

export async function apiFetch(path: string, opts: Opts = {}): Promise<Response> {
  let res: Response;
  try {
    res = await doFetch(path, opts);
  } catch {
    throw new ApiError(0, "network");
  }
  if (res.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/refresh")) {
    if (await tryRefresh()) res = await doFetch(path, opts);
    else {
      onSessionLost?.();
      throw new ApiError(401, "session_expired");
    }
  }
  if (!res.ok) {
    let code = "error";
    let errors;
    try {
      const j = await res.json();
      code = typeof j.detail === "string" ? j.detail : "validation_error";
      errors = j.errors;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, code, errors);
  }
  return res;
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const res = await apiFetch(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Download an authenticated file (PDF, Excel) and save or open it. */
export async function downloadFile(path: string, filename: string, mode: "save" | "open" | "print" = "save") {
  const res = await apiFetch(path);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (mode === "save") {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else if (mode === "open") {
    window.open(url, "_blank", "noopener");
  } else {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.src = url;
    document.body.appendChild(frame);
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60_000);
    };
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
