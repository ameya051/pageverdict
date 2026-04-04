"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeScanSync, normalizeUnknownError } from "@/lib/api";
import { startScanStream, type ScanStreamSession } from "@/lib/sse";
import type { ApiErrorShape, ScanProgress, ScanResult } from "@/lib/types";
import { formatDuration, formatTimestamp, isValidHttpUrl } from "@/lib/utils";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Input } from "@/components/shared/Input";
import { Section } from "@/components/shared/Section";

const defaultUrl = "https://example.com";

const stepLabels: Record<string, string> = {
  collecting: "Collecting page data",
  analyzing: "Running analysis",
  synthesizing: "Generating verdict",
  saving: "Saving result",
  done: "Complete",
};

function getErrorMessage(error: ApiErrorShape | unknown): string {
  return normalizeUnknownError(error).message;
}

export function ScanSandbox() {
  const [url, setUrl] = useState(defaultUrl);
  const [error, setError] = useState<string | null>(null);
  const [isSyncLoading, setIsSyncLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progressEvents, setProgressEvents] = useState<ScanProgress[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const streamRef = useRef<ScanStreamSession | null>(null);

  const latestProgress = progressEvents.at(-1) ?? null;

  const progressLabel = useMemo(() => {
    if (!latestProgress) {
      return "Waiting to start";
    }

    return stepLabels[latestProgress.step] ?? latestProgress.step;
  }, [latestProgress]);

  function resetRunState() {
    setError(null);
    setResult(null);
    setProgressEvents([]);
  }

  function validateUrl(): boolean {
    if (!isValidHttpUrl(url)) {
      setError("Enter a valid http or https URL to start a scan.");
      return false;
    }

    return true;
  }

  async function handleSyncScan() {
    streamRef.current?.abort();
    streamRef.current = null;

    if (!validateUrl()) {
      return;
    }

    resetRunState();
    setIsSyncLoading(true);

    try {
      const scanResult = await analyzeScanSync({ url });
      setResult(scanResult);
    } catch (scanError) {
      setError(getErrorMessage(scanError));
    } finally {
      setIsSyncLoading(false);
    }
  }

  function handleStreamScan() {
    streamRef.current?.abort();
    streamRef.current = null;

    if (!validateUrl()) {
      return;
    }

    resetRunState();
    setIsStreaming(true);

    const session = startScanStream(
      { url },
      {
        onProgress: (progress) => {
          setProgressEvents((current) => [...current, progress]);
        },
        onResult: (scanResult) => {
          setResult(scanResult);
        },
        onError: (scanError) => {
          setError(getErrorMessage(scanError));
        },
        onComplete: () => {
          setIsStreaming(false);
        },
      },
    );

    session.done.catch(() => undefined);
    streamRef.current = session;
  }

  useEffect(() => {
    return () => {
      streamRef.current?.abort();
    };
  }, []);

  return (
    <Section
      eyebrow="Business logic sandbox"
      title="Test the current backend before the final UI lands."
      description="This temporary panel exercises both the synchronous endpoint and the streamed scan flow so we can verify the foundation before building the polished landing experience."
      className="pt-6"
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card
          title="Start a scan"
          description="Use the sync request for quick contract checks or the streamed flow to verify progress handling."
        >
          <label
            htmlFor="scan-url"
            className="mb-3 block text-sm font-medium text-[var(--text-secondary)]"
          >
            Landing page URL
          </label>
          <Input
            id="scan-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            aria-describedby="scan-url-help"
          />
          <p id="scan-url-help" className="mt-3 text-sm text-[var(--text-muted)]">
            The backend rejects non-http URLs and private or reserved IPs.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={handleSyncScan}
              pending={isSyncLoading}
              disabled={isStreaming}
            >
              Test sync analyze
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleStreamScan}
              pending={isStreaming}
              disabled={isSyncLoading}
            >
              Test SSE stream
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                streamRef.current?.abort();
                setIsStreaming(false);
              }}
              disabled={!isStreaming}
            >
              Cancel stream
            </Button>
          </div>

          {error ? (
            <div className="mt-5 rounded-[var(--radius-sm)] severity-critical px-4 py-3 text-sm leading-7">
              {error}
            </div>
          ) : null}
        </Card>

        <div className="grid gap-6">
          <Card
            title="Scan progress"
            description="Streaming updates from POST /api/analyze are normalized here before the real UX is built."
            aside={
              latestProgress ? (
                <Badge variant={latestProgress.step === "done" ? "success" : "info"}>
                  {latestProgress.progress}%
                </Badge>
              ) : (
                <Badge variant="default">Idle</Badge>
              )
            }
          >
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${latestProgress?.progress ?? 0}%` }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {progressLabel}
              </p>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {latestProgress?.message ?? "No events received yet"}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {progressEvents.length === 0 ? (
                <p className="text-sm leading-7 text-[var(--text-secondary)]">
                  Start an SSE scan to watch the backend stream progress events.
                </p>
              ) : (
                progressEvents.map((event, index) => (
                  <div
                    key={`${event.step}-${event.progress}-${index}`}
                    className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/55 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {stepLabels[event.step] ?? event.step}
                      </p>
                      <Badge variant="default">{event.progress}%</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                      {event.message}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card
            title="Latest result"
            description="A compact preview of the typed scan data returned from the backend."
          >
            {result ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="success">{result.overall_score}/10</Badge>
                  <Badge variant="default">{result.id}</Badge>
                </div>

                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {result.metadata?.page_title || result.url}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                    {result.roast_summary}
                  </p>
                </div>

                {result.metadata?.warnings.length ? (
                  <div className="space-y-2">
                    {result.metadata.warnings.map((warning) => (
                      <div
                        key={warning}
                        className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-[color:var(--warning-bg)] px-4 py-3 text-sm leading-7 text-[var(--warning-text)]"
                      >
                        {warning}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--radius-sm)] bg-white/55 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Duration
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {formatDuration(result.metadata?.scan_duration_ms)}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] bg-white/55 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Created
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {formatTimestamp(result.created_at)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {result.sections.map((section) => (
                    <div
                      key={`${result.id}-${section.category}`}
                      className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/55 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {section.name}
                        </p>
                        <Badge variant="default">
                          {section.score}/{section.max_score}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                        {section.summary}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm leading-7 text-[var(--text-secondary)]">
                Run a sync or streaming scan to see the typed ScanResult preview
                here.
              </p>
            )}
          </Card>
        </div>
      </div>
    </Section>
  );
}
