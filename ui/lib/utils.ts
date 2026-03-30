type ClassNameValue = string | false | null | undefined;

export function cn(...values: ClassNameValue[]): string {
  return values.filter(Boolean).join(" ");
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
