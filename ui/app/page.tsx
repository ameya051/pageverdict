import { FoundationHero } from "@/components/home/FoundationHero";
import { ScanSandbox } from "@/components/home/ScanSandbox";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { Section } from "@/components/shared/Section";

const deliverables = [
  {
    title: "Contracts",
    description:
      "Frontend types mirror the FastAPI schemas, including progress events and saved scan results.",
  },
  {
    title: "API layer",
    description:
      "Sync requests, scan lookup, and normalized error handling live in one place.",
  },
  {
    title: "SSE streaming",
    description:
      "A fetch-based stream parser handles progress, result, and error events from POST /api/analyze.",
  },
  {
    title: "Design system",
    description:
      "Shared primitives, tokens, and severity styles are in place before the larger UI work starts.",
  },
];

const backendEndpoints = [
  "POST /api/analyze",
  "POST /api/analyze/sync",
  "GET /api/scan/{id}",
];

export default function Home() {
  return (
    <main className="page-shell pb-20">
      <FoundationHero />
      <ScanSandbox />

      <Section
        eyebrow="Phase 1 scope"
        title="Foundation work is in place for the next phases."
        description="This homepage stays intentionally lightweight, but the data layer and reusable UI pieces are ready for the full landing flow and result pages."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {deliverables.map((item) => (
            <Card key={item.title} title={item.title} description={item.description}>
              <p className="text-sm leading-7 text-[var(--text-secondary)]">
                The goal here is stability first: less one-off code later, fewer
                mismatches with the backend, and a smoother path into the real
                product UI.
              </p>
            </Card>
          ))}
        </div>

        <Card
          className="mt-6"
          title="Current backend contract"
          description="The frontend utilities are aligned to the endpoints that already exist today."
        >
          <div className="flex flex-wrap gap-3">
            {backendEndpoints.map((endpoint) => (
              <Badge key={endpoint} variant="default">
                {endpoint}
              </Badge>
            ))}
          </div>
        </Card>
      </Section>
    </main>
  );
}
