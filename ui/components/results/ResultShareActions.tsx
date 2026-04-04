"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonStyles } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";

interface ResultShareActionsProps {
  shareUrl: string;
  resultLabel: string;
  overallScore: string;
}

function getTwitterShareUrl(shareUrl: string, resultLabel: string, overallScore: string) {
  const text = `${resultLabel} scored ${overallScore}/10 on Landing Page Roaster.`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
}

function getLinkedInShareUrl(shareUrl: string) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
}

export function ResultShareActions({
  shareUrl,
  resultLabel,
  overallScore,
}: ResultShareActionsProps) {
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <Card
      title="Share this roast"
      description="Copy the permanent link or send the result straight to social while the critique is still fresh."
    >
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={handleCopyLink}>
          {copyState === "success" ? "Link copied" : "Copy link"}
        </Button>
        <a
          href={getTwitterShareUrl(shareUrl, resultLabel, overallScore)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Share the roast for ${resultLabel} to X`}
          className={buttonStyles({ variant: "secondary" })}
        >
          Share to X
        </a>
        <a
          href={getLinkedInShareUrl(shareUrl)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Share the roast for ${resultLabel} to LinkedIn`}
          className={buttonStyles({ variant: "secondary" })}
        >
          Share to LinkedIn
        </a>
        <Link href="/" className={buttonStyles({ variant: "ghost" })}>
          Roast another page
        </Link>
      </div>

      <div className="mt-4 rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/60 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Share URL
        </p>
        <p className="mt-2 break-all font-mono text-sm text-[var(--text-primary)]">
          {shareUrl}
        </p>
      </div>

      {copyState === "error" ? (
        <p className="mt-3 text-sm leading-7 text-[var(--critical-text)]" aria-live="polite">
          Clipboard access was blocked in this browser. You can still copy the URL
          above.
        </p>
      ) : null}

      {copyState === "success" ? (
        <p className="mt-3 text-sm leading-7 text-[rgb(48,96,55)]" aria-live="polite">
          Share link copied to your clipboard.
        </p>
      ) : null}
    </Card>
  );
}
