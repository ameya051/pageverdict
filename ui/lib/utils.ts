type ClassNameValue = string | false | null | undefined;

export function cn(...values: ClassNameValue[]): string {
  return values.filter(Boolean).join(" ");
}

export function getScanUrlValidationError(value: string): string | null {
  const raw = value.trim();

  if (!raw) {
    return "Paste a landing page URL to start the roast.";
  }

  if (raw.length > 2048) {
    return "URL is too long. Keep it under 2048 characters.";
  }

  try {
    const url = new URL(raw);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Only http and https URLs are supported.";
    }

    if (url.username || url.password) {
      return "URLs with embedded credentials are not allowed.";
    }

    if (url.hostname === "localhost") {
      return "Localhost URLs cannot be scanned.";
    }

    return null;
  } catch {
    return "Enter a full http or https URL.";
  }
}

export function isValidHttpUrl(value: string): boolean {
  return getScanUrlValidationError(value) === null;
}

export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) {
    return "Unknown";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = durationMs / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatScore(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
