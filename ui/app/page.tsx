import Link from "next/link";
import { HomeScanExperience } from "@/components/home/HomeScanExperience";
import { Badge } from "@/components/shared/Badge";
import { buttonStyles } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Section } from "@/components/shared/Section";

const howItWorks = [
  {
    title: "Paste your URL",
    description:
      "Start with any public landing page using a full http or https URL. No account required for the anonymous tier.",
  },
  {
    title: "Watch the scan work",
    description:
      "The homepage streams progress while Playwright, PageSpeed, and the analysis agents do their part.",
  },
  {
    title: "Get a roast that prioritizes",
    description:
      "Each report scores performance, copy, SEO, and technical health, then explains what deserves attention first.",
  },
  {
    title: "Share the result",
    description:
      "Every completed scan lands on a permanent result URL so you can send it to teammates, clients, or the group chat.",
  },
];

const sampleRoasts = [
  {
    category: "Copy & conversion",
    tone: "severity-critical",
    quote:
      "Your headline sounds polite, but it never answers why someone should care right now.",
  },
  {
    category: "Performance",
    tone: "severity-warning",
    quote:
      "The page looks premium after it loads. The problem is that hesitation gets there first.",
  },
  {
    category: "Technical health",
    tone: "severity-info",
    quote:
      "The bones are solid, but a few avoidable issues are leaking credibility before the CTA has a chance.",
  },
];

const comparisonRows = [
  {
    label: "Performance context",
    auditTool: "Deep metrics, minimal prioritization",
    roaster: "Curated explanation of what speed issues mean for conversions",
  },
  {
    label: "Copy feedback",
    auditTool: "Not covered",
    roaster: "Scores the message, clarity, and CTA pressure",
  },
  {
    label: "Shareability",
    auditTool: "Usually a private report",
    roaster: "Permanent public result URL built for sharing",
  },
  {
    label: "Tone",
    auditTool: "Clinical and dry",
    roaster: "Witty, direct, and still constructive",
  },
];

const pricingCards = [
  {
    tier: "Anonymous",
    price: "$0",
    detail: "For quick spot checks before a launch or redesign.",
    features: [
      "3 scans per month",
      "Live progress on the homepage",
      "Shareable result pages",
    ],
  },
  {
    tier: "Free account",
    price: "$0",
    detail: "Coming next with login and dashboard history.",
    features: [
      "10 scans per month",
      "Saved history",
      "Same shareable results",
    ],
  },
  {
    tier: "Pro",
    price: "$9/mo",
    detail: "For teams that roast pages as part of their regular workflow.",
    features: [
      "Unlimited scans",
      "Priority usage",
      "Future exports and comparison tools",
    ],
  },
];

export default function Home() {
  return (
    <main className="page-shell pb-20">
      <HomeScanExperience />

      <Section
        eyebrow="How It Works"
        title="A faster way to find what is weakening the page."
        description="The product is opinionated on purpose: it combines technical signals with copy critique so the result feels closer to feedback from a sharp teammate than another analytics dashboard."
      >
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {howItWorks.map((item, index) => (
            <Card key={item.title} title={item.title} description={item.description}>
              <p className="eyebrow text-[0.72rem]">Step {index + 1}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Example Roast"
        title="Specific enough to act on, sharp enough to be memorable."
        description="The roast format is the point. You should be able to scan it quickly, share it instantly, and walk away with a short list of fixes that matter."
      >
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card
            title="The verdict is not shy"
            description="A good roast balances personality with useful prioritization."
          >
            <div className="rounded-[var(--radius-md)] border border-[color:var(--border-soft)] bg-[linear-gradient(145deg,rgba(196,92,43,0.12),rgba(255,255,255,0.86))] p-5">
              <Badge variant="success">Overall 6/10</Badge>
              <p className="mt-4 text-xl font-semibold leading-8 tracking-[-0.03em] text-[var(--text-primary)]">
                &ldquo;You have a credible product hiding behind a landing page that
                asks for trust before it earns it.&rdquo;
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                The hero takes too long to explain itself, the supporting proof is
                buried, and the speed hiccups add just enough friction for doubt to
                win. The good news is the fix list is shorter than the page makes it
                seem.
              </p>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {sampleRoasts.map((sample) => (
              <Card
                key={sample.category}
                title={sample.category}
                className={sample.tone}
              >
                <p className="text-sm leading-7">{sample.quote}</p>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Comparison"
        title="Built for people who need clearer direction than a raw audit dump."
        description="PageSpeed and Lighthouse remain valuable. This product adds the missing layer: how those technical and messaging issues affect the page as a pitch."
        className="scroll-mt-20"
      >
        <div
          id="comparison"
          className="overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border-soft)] bg-[rgba(255,255,255,0.74)] shadow-[var(--shadow-md)]"
        >
          <div className="grid min-w-[720px] grid-cols-[1.05fr_1fr_1fr] gap-px bg-[color:var(--border-soft)] text-sm leading-7">
            <div className="bg-[var(--surface-raised)] px-4 py-4 font-semibold text-[var(--text-primary)] sm:px-6">
              Feature
            </div>
            <div className="bg-[var(--surface-raised)] px-4 py-4 font-semibold text-[var(--text-primary)] sm:px-6">
              PageSpeed / Lighthouse
            </div>
            <div className="bg-[var(--surface-raised)] px-4 py-4 font-semibold text-[var(--text-primary)] sm:px-6">
              Landing Page Roaster
            </div>

            {comparisonRows.map((row) => (
              <div key={row.label} className="contents">
                <div className="bg-white/80 px-4 py-4 font-medium text-[var(--text-primary)] sm:px-6">
                  {row.label}
                </div>
                <div className="bg-white/80 px-4 py-4 text-[var(--text-secondary)] sm:px-6">
                  {row.auditTool}
                </div>
                <div className="bg-[rgba(241,207,187,0.28)] px-4 py-4 text-[var(--text-primary)] sm:px-6">
                  {row.roaster}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Pricing"
        title="Useful as a free tool now, ready for a larger product later."
        description="The MVP is intentionally generous for anonymous users. The account and billing flows can grow into the same frontend structure without rewriting the homepage funnel."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {pricingCards.map((card) => (
            <Card
              key={card.tier}
              title={card.tier}
              description={card.detail}
              aside={
                <Badge variant={card.tier === "Pro" ? "success" : "default"}>
                  {card.price}
                </Badge>
              }
            >
              <div className="space-y-3">
                {card.features.map((feature) => (
                  <div
                    key={feature}
                    className="rounded-[var(--radius-sm)] border border-[color:var(--border-soft)] bg-white/60 px-4 py-3 text-sm leading-7 text-[var(--text-secondary)]"
                  >
                    {feature}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Final CTA"
        title="If the page is how you sell, it deserves more than a vibes check."
        description="Start with the homepage scan flow today, then share the result URL with whoever owns the next round of edits."
      >
        <Card className="overflow-hidden bg-[linear-gradient(135deg,rgba(196,92,43,0.16),rgba(255,252,247,0.94))]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                Roast your own landing page, then hand the result to the team.
              </h3>
              <p className="mt-3 text-base leading-8 text-[var(--text-secondary)]">
                The homepage submission now streams live progress and redirects into
                a permanent result URL when the scan finishes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="#scan-form"
                className={buttonStyles({ variant: "primary", size: "lg" })}
              >
                Start a scan
              </Link>
              <a
                href="#comparison"
                className={buttonStyles({ variant: "secondary", size: "lg" })}
              >
                Review the comparison
              </a>
            </div>
          </div>
        </Card>
      </Section>
    </main>
  );
}
