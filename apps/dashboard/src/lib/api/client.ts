const API_ORIGIN = process.env["NEXT_PUBLIC_API_ORIGIN"] ?? "http://localhost:3001";
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
  readonly details?: Readonly<Record<string, unknown>> | undefined;
}

/** Mirrors apps/api's AppExceptionFilter response body exactly. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string;
  readonly details?: Readonly<Record<string, unknown>> | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.correlationId = body.correlationId;
    this.details = body.details;
  }
}

/** Thrown when `fetch` itself fails (network down), distinct from a server error response. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("Network request failed.");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const match = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
  return match?.split("=")[1];
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * A13.3: no credential lives in this client — session identity travels
 * entirely through the httpOnly session/refresh cookies apps/api already
 * set; this only echoes the non-httpOnly CSRF cookie back as a header
 * (the double-submit pattern CsrfGuard checks, A3.9).
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      headers[CSRF_HEADER_NAME] = csrfToken;
    }
  }

  const init: RequestInit = { method, headers, credentials: "include" };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  if (options.signal !== undefined) {
    init.signal = options.signal;
  }

  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, init);
  } catch (cause) {
    throw new NetworkError(cause);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const body =
      payload && typeof payload === "object" && "code" in payload
        ? (payload as ApiErrorBody)
        : { code: "UNKNOWN", message: response.statusText, correlationId: "unknown" };
    throw new ApiError(response.status, body);
  }

  return payload as T;
}
