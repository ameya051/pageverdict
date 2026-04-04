import type { ApiErrorShape, ScanRequest, ScanResult } from "@/lib/types";

const FALLBACK_API_URL = "http://localhost:8000";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  return trimTrailingSlash(
    process.env.NEXT_PUBLIC_API_URL?.trim() || FALLBACK_API_URL,
  );
}

export function createApiUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

export class ApiClientError extends Error implements ApiErrorShape {
  status: number;
  detail?: string;
  raw?: unknown;

  constructor({ message, status, detail, raw }: ApiErrorShape) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.detail = detail;
    this.raw = raw;
  }
}

export async function parseApiErrorResponse(
  response: Response,
): Promise<ApiClientError> {
  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    try {
      payload = await response.text();
    } catch {
      payload = null;
    }
  }

  const detail =
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof payload.detail === "string"
      ? payload.detail
      : undefined;

  return new ApiClientError({
    status: response.status,
    detail,
    raw: payload,
    message: detail || `Request failed with status ${response.status}.`,
  });
}

export function normalizeUnknownError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiClientError({
      status: 499,
      message: "Request cancelled.",
      raw: error,
    });
  }

  if (error instanceof Error) {
    return new ApiClientError({
      status: 500,
      message: error.message || "Unexpected client error.",
      raw: error,
    });
  }

  return new ApiClientError({
    status: 500,
    message: "Unexpected client error.",
    raw: error,
  });
}

async function requestJson<T>(
  pathname: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(createApiUrl(pathname), {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await parseApiErrorResponse(response);
  }

  return (await response.json()) as T;
}

export function analyzeScanSync(
  body: ScanRequest,
  init: RequestInit = {},
): Promise<ScanResult> {
  return requestJson<ScanResult>("/api/analyze/sync", {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
  });
}

export function fetchScanById(
  scanId: string,
  init: RequestInit = {},
): Promise<ScanResult> {
  return requestJson<ScanResult>(`/api/scan/${scanId}`, {
    method: "GET",
    ...init,
  });
}
