import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultShareActions } from "@/components/results/ResultShareActions";
import { Badge } from "@/components/shared/Badge";
import { buttonStyles } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Container } from "@/components/shared/Container";
import { StatusNotice } from "@/components/shared/StatusNotice";
import { ApiClientError, fetchScanById } from "@/lib/api";
import type { AuditSection, Issue, ScanResult, ScanSeverity } from "@/lib/types";
import { formatDuration, formatScore, formatTimestamp } from "@/lib/utils";

const scanIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const severityOrder: ScanSeverity[] = ["critical", "warning", "info"];

const sectionOrder = ["performance", "copy", "seo", "tech_health"] as const;

const missingResultMetadata: Metadata = {
  title: "Scan not found | Landing Page Roaster",
  description:
    "This landing page roast result is missing, malformed, or no longer available.",
};

type ResultPageParams = {
  id: string;
};

type ResultPageProps = {
  params: Promise<ResultPageParams>;
};

function isValidScanId(id: string) {
  return scanIdPattern.test(id);
}

function getSeverityVariant(severity: ScanSeverity) {
  if (severity === "critical") {
    return "critical";
  }

  if (severity === "warning") {
    return "warning";
  }

  return "info";
}

function getSeverityHeading(severity: ScanSeverity) {
  if (severity === "critical") {
    return "Critical issues";
  }

  if (severity === "warning") {
    return "Warnings";
  }

  return "Info";
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function getResultLabel(result: ScanResult) {
  return result.metadata?.page_title?.trim() || getHostname(result.url);
}

function getSectionSortIndex(category: string) {
  const index = sectionOrder.indexOf(category as (typeof sectionOrder)[number]);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function groupIssuesBySeverity(issues: Issue[]) {
  return severityOrder
    .map((severity) => ({
      severity,
      issues: issues.filter((issue) => issue.severity === severity),
    }))
    .filter((group) => group.issues.length > 0);
}

function getOrderedSections(sections: AuditSection[]) {
  return [...sections].sort((left, right) => {
    const indexDifference =
      getSectionSortIndex(left.category) - getSectionSortIndex(right.category);

    if (indexDifference !== 0) {
      return indexDifference;
    }

    return left.name.localeCompare(right.name);
  });
}

function trimDescription(value: string, maxLength = 160) {
  const normalized = value.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

async function getRequestBaseUrl() {
  const requestHeaders = await headers();
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";

  return `${protocol}://${host}`;
}

async function fetchResult(id: string) {
  return fetchScanById(id, { cache: "no-store" });
}

async function fetchResultForPage(id: string) {
  if (!isValidScanId(id)) {
    notFound();
  }

  try {
    return await fetchResult(id);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}

export async function generateMetadata({
  params,
}: ResultPageProps): Promise<Metadata> {
  const { id } = await params;

  if (!isValidScanId(id)) {
    return missingResultMetadata;
  }

  try {
    const result = await fetchResult(id);
    const shareUrl = `${await getRequestBaseUrl()}/r/${result.id}`;
    const resultLabel = getResultLabel(result);
    const title = `${formatScore(result.overall_score)}/10 Roast for ${resultLabel} | Landing Page Roaster`;
    const description = trimDescription(result.roast_summary);
    const previewImage = result.screenshot_url || undefined;

    return {
      title,
      description,
      alternates: {
        canonical: shareUrl,
      },
      openGraph: {
        title,
        description,
        url: shareUrl,
        type: "article",
        images: previewImage
          ? [
              {
                url: previewImage,
                alt: `Landing Page Roaster preview for ${resultLabel}`,
              },
            ]
          : undefined,
      },
      twitter: {
        card: previewImage ? "summary_large_image" : "summary",
        title,
        description,
        images: previewImage ? [previewImage] : undefined,
      },
    };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return missingResultMetadata;
    }

    return {
      title: "Result unavailable | Landing Page Roaster",
      description:
        "This landing page roast could not be loaded for sharing metadata.",
    };
  }
}

export default async function ResultPage({ params }: ResultPageProps) {
  const { id } = await params;
  const result = await fetchResultForPage(id);
  const shareUrl = `${await getRequestBaseUrl()}/r/${result.id}`;
  const orderedSections = getOrderedSections(result.sections);
  const pageDescription = result.metadata?.page_description?.trim();

  return (
    <main className="page-shell pb-20 pt-8 sm:pt-12">
      <Container>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className="eyebrow">Shareable Result</p>
            <div className="mt-3 flex items-center gap-3">
              {result.metadata?.favicon_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.metadata.favicon_url}
                    alt=""
                    className="h-11 w-11 rounded-2xl border border-[color:var(--border-soft)] bg-white/85 p-2"
                  />
                </>
              ) : null}
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[var(--text-primary)] sm:text-5xl">
                {getResultLabel(result)}
              </h1>
            </div>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--text-secondary)]">
              {result.roast_summary}
            </p>
          </div>
          <Link
            href="/"
            className={buttonStyles({ variant: "secondary", size: "lg", className: "w-full sm:w-auto" })}
          >
            Roast another page
          </Link>
        </header>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="grid gap-6">
            <Card
              title="Summary"
              description="The saved scan record is fetched on the server so the page renders cleanly on refresh and direct share."
              aside={
                <Badge
                  variant="success"
                  className="motion-safe:animate-[rise-in_520ms_ease-out]"
                >
                  {formatScore(result.overall_score)}/10
                </Badge>
              }
            >
              <div className="space-y-5">
                {result.screenshot_url ? (
                  <div className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border-soft)] bg-white/55">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={result.screenshot_url}
                      alt={`Screenshot of ${result.url}`}
                      className="h-auto w-full object-cover"
                    />
                  </div>
                ) : (
                  <StatusNotice
                    tone="info"
                    title="Screenshot unavailable"
                    description="The scan saved successfully, but the preview image was not attached to this result."
                  />
                )}

                <div className="grid result-stat-grid gap-3">
                  <div className="rounded-[var(--radius-sm)] bg-white/65 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Target URL
                    </p>
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block break-all text-sm font-medium text-[var(--text-primary)] underline decoration-[color:var(--border-strong)] underline-offset-4"
                    >
                      {result.url}
                    </a>
                  </div>
                  <div className="rounded-[var(--radius-sm)] bg-white/65 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Scan ID
                    </p>
                    <p className="mt-2 break-all font-mono text-sm text-[var(--text-primary)]">
                      {result.id}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] bg-white/65 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Created
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {formatTimestamp(result.created_at)}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] bg-white/65 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Duration
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {formatDuration(result.metadata?.scan_duration_ms)}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] bg-white/65 px-4 py-3 sm:col-span-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Technologies
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {result.metadata?.technologies.length
                        ? result.metadata.technologies.join(", ")
                        : "Not detected"}
                    </p>
                  </div>
                </div>

                {pageDescription ? (
                  <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/60 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Page description
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                      {pageDescription}
                    </p>
                  </div>
                ) : null}

                {result.metadata?.warnings.length ? (
                  <div className="space-y-2">
                    {result.metadata.warnings.map((warning) => (
                      <StatusNotice key={warning} tone="warning" description={warning} />
                    ))}
                  </div>
                ) : null}
              </div>
            </Card>

            <ResultShareActions
              shareUrl={shareUrl}
              resultLabel={getResultLabel(result)}
              overallScore={formatScore(result.overall_score)}
            />
          </div>

          <section className="grid gap-6" aria-label="Audit sections">
            {orderedSections.length ? (
              orderedSections.map((section) => {
                const issueGroups = groupIssuesBySeverity(section.issues);

                return (
                  <Card
                    key={`${result.id}-${section.category}`}
                    title={section.name}
                    description={section.summary}
                    aside={
                      <Badge variant="default">
                        {formatScore(section.score)}/{formatScore(section.max_score)}
                      </Badge>
                    }
                  >
                    <div className="space-y-5">
                      {issueGroups.length ? (
                        <div className="space-y-4">
                          {issueGroups.map((group) => (
                            <section key={`${section.category}-${group.severity}`}>
                              <p className="eyebrow mb-2">
                                {getSeverityHeading(group.severity)}
                              </p>
                              <div className="space-y-2">
                                {group.issues.map((issue) => (
                                  <article
                                    key={issue.id}
                                    className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/60 px-4 py-3"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-medium text-[var(--text-primary)]">
                                        {issue.title}
                                      </p>
                                      <Badge variant={getSeverityVariant(issue.severity)}>
                                        {issue.severity}
                                      </Badge>
                                    </div>
                                    <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                                      {issue.description}
                                    </p>
                                    <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                                      <span className="font-medium text-[var(--text-primary)]">
                                        Impact:
                                      </span>{" "}
                                      {issue.impact}
                                    </p>
                                    <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                                      <span className="font-medium text-[var(--text-primary)]">
                                        Fix:
                                      </span>{" "}
                                      {issue.recommendation}
                                    </p>
                                  </article>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      ) : (
                        <StatusNotice
                          tone="success"
                          title="No issues flagged"
                          description="This section came back clean enough that the audit did not call out a specific fix."
                        />
                      )}

                      {section.strengths.length ? (
                        <div className="rounded-[var(--radius-sm)] bg-[rgba(88,140,96,0.12)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-[rgb(48,96,55)]">
                            Strengths
                          </p>
                          <div className="mt-3 space-y-2">
                            {section.strengths.map((strength) => (
                              <p
                                key={strength}
                                className="text-sm leading-7 text-[rgb(48,96,55)]"
                              >
                                {strength}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                );
              })
            ) : (
              <Card
                title="No audit sections were saved"
                description="The result record exists, but the detailed sections were missing from the response."
              >
                <StatusNotice
                  tone="warning"
                  description="Try refreshing once. If the data stays empty, the scan may have failed while the backend was composing the full report."
                />
              </Card>
            )}
          </section>
        </div>

        <Card className="mt-8 bg-[linear-gradient(135deg,rgba(196,92,43,0.16),rgba(255,252,247,0.94))]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                Share the verdict, then queue up the next page.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-8 text-[var(--text-secondary)]">
                Each successful scan ends at a permanent URL, so teams can refresh
                the report, pass it around, and jump straight back into the main
                funnel for another roast.
              </p>
            </div>
            <Link
              href="/"
              className={buttonStyles({ variant: "primary", size: "lg", className: "w-full sm:w-auto" })}
            >
              Back to homepage
            </Link>
          </div>
        </Card>
      </Container>
    </main>
  );
}
