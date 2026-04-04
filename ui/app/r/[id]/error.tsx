"use client";

import Link from "next/link";
import { useMemo } from "react";
import { RetryButton } from "@/components/shared/RetryButton";
import { buttonStyles } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Container } from "@/components/shared/Container";
import { StatusNotice } from "@/components/shared/StatusNotice";
import { normalizeUnknownError } from "@/lib/api";

export default function ResultError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const normalized = useMemo(() => normalizeUnknownError(error), [error]);
  const isRateLimited = normalized.status === 429;

  return (
    <main className="page-shell pb-20 pt-8 sm:pt-12">
      <Container>
        <Card
          title="This result page could not be loaded."
          description="The scan may still be saving, the API may be unavailable, or the request failed while the page was rebuilding."
        >
          <StatusNotice
            tone={isRateLimited ? "warning" : "critical"}
            live="assertive"
            title={isRateLimited ? "Too many requests" : "Fetch failed"}
            description={normalized.message}
          />

          <div className="mt-5 flex flex-wrap gap-3">
            <RetryButton size="lg">Try loading the result again</RetryButton>
            <Link
              href="/"
              className={buttonStyles({ variant: "secondary", size: "lg" })}
            >
              Back to homepage
            </Link>
          </div>
        </Card>
      </Container>
    </main>
  );
}
