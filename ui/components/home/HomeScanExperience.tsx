"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { analyzeScanSync, normalizeUnknownError } from "@/lib/api";
import { startScanStream, type ScanStreamSession } from "@/lib/sse";
import type { ApiErrorShape, ScanProgress } from "@/lib/types";
import { formatScore, getScanUrlValidationError } from "@/lib/utils";
import { Badge } from "@/components/shared/Badge";
import { Button, buttonStyles } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Container } from "@/components/shared/Container";
import { Input } from "@/components/shared/Input";
import { StatusNotice } from "@/components/shared/StatusNotice";

const defaultUrl = "https://example.com";
const stallThresholdMs = 9000;

const heroStats = [
  { value: "6-15s", label: "Typical time to roast" },
  { value: "4", label: "Scored audit sections" },
  { value: "3", label: "Anonymous scans each month" },
];

const progressPhases = [
  {
    label: "Visiting your page",
    detail: "Opening the URL in a real browser and capturing the essentials.",
  },
  {
    label: "Checking speed metrics",
    detail: "Pulling PageSpeed signals while the page data finishes loading.",
  },
  {
    label: "Reading your copy",
    detail: "Reviewing messaging, SEO, and technical health in parallel.",
  },
  {
    label: "Writing the roast",
    detail: "Synthesizing the verdict and saving a shareable result URL.",
  },
];

const sampleHighlights = [
  {
    label: "Performance",
    value: "4.5/10",
    note: "Hero image asks mobile users to wait too long.",
  },
  {
    label: "Copy",
    value: "7.5/10",
    note: "Clear offer, but the headline hides the payoff.",
  },
  {
    label: "SEO",
    value: "6/10",
    note: "Metadata exists, but intent and page hierarchy are fuzzy.",
  },
];

function getFriendlyErrorMessage(error: ApiErrorShape | unknown): string {
  const normalized = normalizeUnknownError(error);

  if (normalized.status === 429) {
    return "Anonymous scans are limited to 3 per month right now. Try again later or connect auth once the dashboard lands.";
  }

  if (normalized.status === 499) {
    return "Scan cancelled.";
  }

  return normalized.message;
}

function getCurrentPhaseIndex(progress: ScanProgress | null): number {
  if (!progress) {
    return 0;
  }

  if (progress.step === "collecting") {
    return progress.progress >= 20 ? 1 : 0;
  }

  if (progress.step === "analyzing") {
    return 2;
  }

  return 3;
}

export function HomeScanExperience() {
  const router = useRouter();
  const [url, setUrl] = useState(defaultUrl);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<ApiErrorShape | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFinishingSync, setIsFinishingSync] = useState(false);
  const [progressEvents, setProgressEvents] = useState<ScanProgress[]>([]);
  const [stallMessage, setStallMessage] = useState<string | null>(null);
  const streamRef = useRef<ScanStreamSession | null>(null);
  const streamOutcomeRef = useRef<"idle" | "pending" | "result" | "error" | "aborted">(
    "idle",
  );
  const lastSignalAtRef = useRef<number | null>(null);

  const latestProgress = progressEvents.at(-1) ?? null;
  const currentPhaseIndex = useMemo(
    () => getCurrentPhaseIndex(latestProgress),
    [latestProgress],
  );
  const isBusy = isStreaming || isFinishingSync;
  const hasRunHistory = progressEvents.length > 0;
  const hasFatalError = Boolean(scanError);
  const hasMidwayFailure = hasFatalError && hasRunHistory;
  const isRateLimited = scanError?.status === 429;
  const displayError = validationError || (scanError ? getFriendlyErrorMessage(scanError) : null);
  const hasLiveRun = hasRunHistory || isStreaming || isFinishingSync || hasFatalError;
  const latestStatusMessage = isFinishingSync
    ? "Finishing the roast without live updates."
    : latestProgress?.message || "Starting your scan...";
  const statusDescriptionIds = ["homepage-scan-help"];

  if (displayError || stallMessage) {
    statusDescriptionIds.push("homepage-scan-status");
  }

  const refreshStallState = useEffectEvent(() => {
    if (!isStreaming || streamOutcomeRef.current !== "pending") {
      setStallMessage(null);
      return;
    }

    const lastSignalAt = lastSignalAtRef.current;

    if (lastSignalAt && Date.now() - lastSignalAt > stallThresholdMs) {
      setStallMessage(
        "Live updates have paused. The backend may still be working, so you can wait a bit longer or finish with the fallback request.",
      );
      return;
    }

    setStallMessage(null);
  });

  useEffect(() => {
    if (!isStreaming) {
      setStallMessage(null);
      return;
    }

    const intervalId = window.setInterval(() => {
      refreshStallState();
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      streamOutcomeRef.current = "aborted";
      streamRef.current?.abort();
    };
  }, []);

  function abortActiveStream() {
    streamOutcomeRef.current = "aborted";
    streamRef.current?.abort();
    streamRef.current = null;
    setIsStreaming(false);
  }

  function clearFeedbackState() {
    setValidationError(null);
    setScanError(null);
    setStallMessage(null);
  }

  function clearRunState() {
    clearFeedbackState();
    setProgressEvents([]);
    lastSignalAtRef.current = null;
  }

  function validateUrl() {
    const nextValidationError = getScanUrlValidationError(url);
    setValidationError(nextValidationError);
    return nextValidationError;
  }

  function beginRedirect(scanId: string) {
    startTransition(() => {
      router.push(`/r/${scanId}`);
    });
  }

  function startStreamingScan() {
    abortActiveStream();

    const nextValidationError = validateUrl();
    if (nextValidationError) {
      return;
    }

    clearRunState();
    setIsStreaming(true);
    streamOutcomeRef.current = "pending";
    lastSignalAtRef.current = Date.now();

    const session = startScanStream(
      { url: url.trim() },
      {
        onOpen: () => {
          lastSignalAtRef.current = Date.now();
        },
        onProgress: (progress) => {
          lastSignalAtRef.current = Date.now();
          setStallMessage(null);
          setProgressEvents((current) => [...current, progress]);
        },
        onResult: (scanResult) => {
          streamOutcomeRef.current = "result";
          beginRedirect(scanResult.id);
        },
        onError: (nextError) => {
          streamOutcomeRef.current = "error";
          setScanError(normalizeUnknownError(nextError));
        },
        onComplete: () => {
          setIsStreaming(false);

          if (streamOutcomeRef.current === "pending") {
            streamOutcomeRef.current = "error";
            setScanError(
              normalizeUnknownError(
                new Error(
                  "Live updates stopped before the roast finished. Try again or finish with the fallback request.",
                ),
              ),
            );
          }
        },
      },
    );

    session.done.catch(() => undefined);
    streamRef.current = session;
  }

  async function finishWithSyncFallback() {
    abortActiveStream();

    const nextValidationError = validateUrl();
    if (nextValidationError) {
      return;
    }

    clearFeedbackState();
    setIsFinishingSync(true);

    try {
      const scanResult = await analyzeScanSync({ url: url.trim() });
      beginRedirect(scanResult.id);
    } catch (nextError) {
      setScanError(normalizeUnknownError(nextError));
    } finally {
      setIsFinishingSync(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startStreamingScan();
  }

  return (
    <section className="pt-8 sm:pt-12">
      <Container>
        <div className="surface-card overflow-hidden rounded-[var(--radius-lg)] px-6 py-8 sm:px-10 sm:py-12">
          <div className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr] xl:items-start">
            <div>
              <Badge variant="default">Anonymous roast, shareable result, no signup</Badge>
              <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.02] tracking-[-0.05em] text-[var(--text-primary)] sm:text-5xl lg:text-6xl">
                Paste a URL. Get the roast your landing page has been avoiding.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                Landing Page Roaster scores performance, copy, SEO, and technical
                health in one pass, then turns the verdict into a result page you
                can actually share.
              </p>

              <form
                id="scan-form"
                className="mt-8"
                onSubmit={handleSubmit}
                aria-busy={isBusy}
              >
                <label
                  htmlFor="homepage-scan-url"
                  className="block text-sm font-medium text-[var(--text-secondary)]"
                >
                  Landing page URL
                </label>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <Input
                    id="homepage-scan-url"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      if (validationError || scanError) {
                        setValidationError(null);
                        setScanError(null);
                      }
                    }}
                    placeholder="https://example.com"
                    aria-invalid={Boolean(validationError)}
                    aria-describedby={statusDescriptionIds.join(" ")}
                    disabled={isBusy}
                    className="sm:flex-1"
                  />
                  <Button type="submit" size="lg" pending={isStreaming}>
                    Start the roast
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
                  <p id="homepage-scan-help">
                    Full `http` or `https` URLs only. Anonymous usage is currently
                    limited to 3 scans per month.
                  </p>
                  <a
                    href="#comparison"
                    className="interactive-link font-medium text-[var(--accent-strong)] hover:text-[var(--accent)]"
                  >
                    See how it compares
                  </a>
                </div>

                {displayError ? (
                  <StatusNotice
                    id="homepage-scan-status"
                    className="mt-4"
                    tone={validationError || scanError?.status === 429 ? "warning" : "critical"}
                    live="polite"
                    title={
                      hasMidwayFailure
                        ? "The scan started, but it did not finish cleanly."
                        : isRateLimited
                          ? "Anonymous limit reached"
                          : validationError
                            ? "Check the URL"
                            : "We could not start the roast."
                    }
                    description={displayError}
                  />
                ) : null}

                {!displayError && stallMessage ? (
                  <StatusNotice
                    id="homepage-scan-status"
                    className="mt-4"
                    tone="warning"
                    live="polite"
                    title="Live updates paused"
                    description={stallMessage}
                  />
                ) : null}

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      void finishWithSyncFallback();
                    }}
                    pending={isFinishingSync}
                    disabled={isStreaming || isRateLimited}
                  >
                    Use sync fallback
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={abortActiveStream}
                    disabled={!isStreaming}
                  >
                    Cancel live scan
                  </Button>
                </div>
              </form>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {heroStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-[var(--radius-md)] border border-[color:var(--border-soft)] bg-white/65 px-4 py-4"
                  >
                    <p className="text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                      {stat.value}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Card
              title={
                hasFatalError && !isBusy
                  ? hasMidwayFailure
                    ? "Scan interrupted"
                    : "Scan could not start"
                  : hasLiveRun
                    ? "Live roast progress"
                    : "What the result feels like"
              }
              description={
                hasFatalError && !isBusy
                  ? hasMidwayFailure
                    ? "You should still have enough context to decide whether to retry the live scan or finish with the fallback request."
                    : "The form should never fail silently, so this panel stays useful even when the scan does not."
                  : hasLiveRun
                    ? "You should never be left staring at a frozen spinner while the backend does real work."
                    : "A good roast is specific, constructive, and easy to share with the people who need to fix the page."
              }
              aside={
                hasFatalError && !isBusy ? (
                  <Badge variant={isRateLimited ? "warning" : "critical"}>
                    {isRateLimited ? "Paused" : "Needs retry"}
                  </Badge>
                ) : hasLiveRun ? (
                  <Badge variant={isBusy ? "info" : "success"}>
                    {latestProgress?.progress ?? (isFinishingSync ? 100 : 0)}%
                  </Badge>
                ) : (
                  <Badge variant="success">Sample verdict</Badge>
                )
              }
              className="relative overflow-hidden"
            >
              {hasFatalError && !isBusy ? (
                <div className="space-y-5">
                  <StatusNotice
                    tone={isRateLimited ? "warning" : "critical"}
                    title={
                      hasMidwayFailure
                        ? "The backend stopped before the shareable result was saved."
                        : isRateLimited
                          ? "The anonymous plan hit its current limit."
                          : "The request failed before we could lock into a clean scan."
                    }
                    description={getFriendlyErrorMessage(scanError)}
                  />

                  {hasRunHistory ? (
                    <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/60 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Latest backend update
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                        {latestProgress?.message || "The scan ended before a final verdict arrived."}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/60 px-4 py-3 text-sm leading-7 text-[var(--text-secondary)]">
                      No result was saved yet. Retry the live flow or switch to the
                      sync fallback if streaming is the part that failed.
                    </div>
                  )}

                  {hasRunHistory ? (
                    <div className="space-y-2">
                      {progressEvents.slice(-3).map((event, index) => (
                        <div
                          key={`${event.step}-${event.progress}-${index}`}
                          className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/55 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {event.step}
                            </p>
                            <Badge variant="default">{event.progress}%</Badge>
                          </div>
                          <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                            {event.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    {!isRateLimited ? (
                      <Button type="button" onClick={startStreamingScan}>
                        Retry live scan
                      </Button>
                    ) : null}
                    {!isRateLimited ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          void finishWithSyncFallback();
                        }}
                      >
                        Finish with sync fallback
                      </Button>
                    ) : null}
                    <a
                      href="#scan-form"
                      className={buttonStyles({ variant: "ghost", className: "w-full sm:w-auto" })}
                    >
                      Edit the URL
                    </a>
                  </div>
                </div>
              ) : hasLiveRun ? (
                <div className="space-y-5" aria-live="polite" aria-busy={isBusy}>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${latestProgress?.progress ?? (isFinishingSync ? 100 : 12)}%` }}
                    />
                  </div>

                  <div className="grid gap-3">
                    {progressPhases.map((phase, index) => {
                      const status =
                        latestProgress?.step === "done"
                          ? "complete"
                          : index < currentPhaseIndex
                            ? "complete"
                            : index === currentPhaseIndex
                              ? "current"
                              : "pending";

                      return (
                        <div
                          key={phase.label}
                          className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/65 px-4 py-3 transition motion-reduce:transition-none"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              aria-hidden
                              className={[
                                "mt-1.5 h-3 w-3 rounded-full transition motion-reduce:transition-none",
                                status === "complete"
                                  ? "bg-[var(--accent)]"
                                  : status === "current"
                                    ? "bg-[var(--warning-text)] motion-safe:animate-pulse"
                                    : "bg-[rgba(92,84,73,0.24)]",
                              ].join(" ")}
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-[var(--text-primary)]">
                                  {phase.label}
                                </p>
                                <Badge
                                  variant={
                                    status === "complete"
                                      ? "success"
                                      : status === "current"
                                        ? "warning"
                                        : "default"
                                  }
                                >
                                  {status}
                                </Badge>
                              </div>
                              <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                                {phase.detail}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="rounded-[var(--radius-sm)] bg-white/70 px-4 py-3"
                    role="status"
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Latest backend update
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {latestStatusMessage}
                    </p>
                  </div>

                  {stallMessage ? (
                    <StatusNotice tone="warning" live="polite" description={stallMessage} />
                  ) : null}

                  {progressEvents.length ? (
                    <div className="space-y-2">
                      {progressEvents.slice(-3).map((event, index) => (
                        <div
                          key={`${event.step}-${event.progress}-${index}`}
                          className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/55 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {event.step}
                            </p>
                            <Badge variant="default">{event.progress}%</Badge>
                          </div>
                          <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                            {event.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/55 px-4 py-3 text-sm leading-7 text-[var(--text-secondary)]">
                      Waiting for the first live update. If streaming never warms up,
                      you can cancel and finish with the sync fallback.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <StatusNotice
                    tone="info"
                    title="No live scan yet"
                    description="Start from the URL field and this panel will switch into a step-by-step progress view instead of leaving you with a blank state."
                  />

                  <div className="rounded-[var(--radius-md)] border border-[color:var(--border-soft)] bg-[linear-gradient(135deg,rgba(196,92,43,0.12),rgba(255,255,255,0.84))] p-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="success">Overall {formatScore(6.5)}/10</Badge>
                      <Badge variant="default">example.com</Badge>
                    </div>
                    <p className="mt-4 text-lg font-semibold leading-8 tracking-[-0.03em] text-[var(--text-primary)]">
                      &ldquo;Fast enough to make a first impression, not sharp enough
                      to close the deal.&rdquo;
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                      The product promise is visible, but the page spends too much
                      time warming up and too little time proving value. The roast
                      tells you what to fix first, not just what went wrong.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {sampleHighlights.map((highlight) => (
                      <div
                        key={highlight.label}
                        className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/65 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {highlight.label}
                          </p>
                          <Badge variant="default">{highlight.value}</Badge>
                        </div>
                        <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                          {highlight.note}
                        </p>
                      </div>
                    ))}
                  </div>

                  <a
                    href="#scan-form"
                    className={buttonStyles({
                      variant: "secondary",
                      size: "lg",
                      className: "w-full",
                    })}
                  >
                    Roast your own page
                  </a>
                </div>
              )}
            </Card>
          </div>
        </div>
      </Container>
    </section>
  );
}
