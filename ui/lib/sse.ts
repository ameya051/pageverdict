import {
  ApiClientError,
  createApiUrl,
  normalizeUnknownError,
  parseApiErrorResponse,
} from "@/lib/api";
import type {
  ApiErrorShape,
  ScanProgress,
  ScanRequest,
  ScanResult,
} from "@/lib/types";

export interface ScanStreamHandlers {
  onOpen?: () => void;
  onProgress?: (progress: ScanProgress) => void;
  onResult?: (result: ScanResult) => void;
  onError?: (error: ApiErrorShape) => void;
  onComplete?: () => void;
}

export interface ScanStreamSession {
  abort: () => void;
  done: Promise<void>;
}

function parseEventBlock(block: string): { event: string; data: string } | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

function toStreamError(payload: unknown): ApiClientError {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return new ApiClientError({
      status: 500,
      detail: payload.detail,
      raw: payload,
      message: payload.detail,
    });
  }

  return normalizeUnknownError(payload);
}

export function startScanStream(
  body: ScanRequest,
  handlers: ScanStreamHandlers = {},
  signal?: AbortSignal,
): ScanStreamSession {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  const done = (async () => {
    const response = await fetch(createApiUrl("/api/analyze"), {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw await parseApiErrorResponse(response);
    }

    if (!response.body) {
      throw new ApiClientError({
        status: 500,
        message: "Streaming response body was unavailable.",
      });
    }

    handlers.onOpen?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done: streamDone, value } = await reader.read();

      if (streamDone) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const parsed = parseEventBlock(block);
        if (!parsed) {
          continue;
        }

        const payload = JSON.parse(parsed.data) as unknown;

        if (parsed.event === "progress") {
          handlers.onProgress?.(payload as ScanProgress);
          continue;
        }

        if (parsed.event === "result") {
          handlers.onResult?.(payload as ScanResult);
          continue;
        }

        if (parsed.event === "error") {
          handlers.onError?.(toStreamError(payload));
        }
      }
    }

    if (!buffer.trim()) {
      return;
    }

    const parsed = parseEventBlock(buffer);
    if (!parsed) {
      return;
    }

    const payload = JSON.parse(parsed.data) as unknown;

    if (parsed.event === "progress") {
      handlers.onProgress?.(payload as ScanProgress);
    } else if (parsed.event === "result") {
      handlers.onResult?.(payload as ScanResult);
    } else if (parsed.event === "error") {
      handlers.onError?.(toStreamError(payload));
    }
  })()
    .catch((error: unknown) => {
      const normalized = normalizeUnknownError(error);
      if (normalized.status !== 499) {
        handlers.onError?.(normalized);
      }
      throw normalized;
    })
    .finally(() => {
      if (signal) {
        signal.removeEventListener("abort", forwardAbort);
      }

      handlers.onComplete?.();
    });

  return {
    abort: () => controller.abort(),
    done,
  };
}
