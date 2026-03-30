import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Container } from "@/components/shared/Container";

const highlights = [
  "Backend-aligned scan contracts",
  "Reusable UI primitives and tokens",
  "Sync and streaming test harness",
];

export function FoundationHero() {
  return (
    <section className="pt-8 sm:pt-12">
      <Container>
        <div className="surface-card overflow-hidden rounded-[var(--radius-lg)] px-6 py-8 sm:px-10 sm:py-12">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <Badge variant="default">Phase 1 foundation</Badge>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.05em] text-[var(--text-primary)] sm:text-5xl lg:text-6xl">
                The frontend foundation is ready to start roasting real landing
                pages.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                This first pass focuses on the durable parts of the app: typed
                data contracts, a centralized backend client, streaming support
                for scan progress, and a shared visual system we can keep building
                on.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button type="button" variant="primary" size="lg">
                  Foundation complete
                </Button>
                <Button type="button" variant="secondary" size="lg">
                  Ready for Phase 2
                </Button>
              </div>
            </div>

            <Card
              title="What landed in this phase"
              description="The homepage is a temporary proving ground for business logic, not the final marketing page."
            >
              <ul className="space-y-3 text-sm leading-7 text-[var(--text-secondary)]">
                {highlights.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      className="mt-2 h-2.5 w-2.5 rounded-full bg-[var(--accent)]"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </Container>
    </section>
  );
}
