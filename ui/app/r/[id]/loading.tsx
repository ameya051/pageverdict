import { Card } from "@/components/shared/Card";
import { Container } from "@/components/shared/Container";

export default function ResultLoading() {
  return (
    <main className="page-shell pb-20 pt-8 sm:pt-12">
      <Container>
        <div className="flex flex-col gap-4">
          <div className="h-4 w-32 rounded-full bg-[rgba(92,84,73,0.12)] motion-safe:animate-pulse" />
          <div className="h-12 w-full max-w-2xl rounded-[var(--radius-sm)] bg-[rgba(92,84,73,0.12)] motion-safe:animate-pulse" />
          <div className="h-6 w-full max-w-3xl rounded-[var(--radius-sm)] bg-[rgba(92,84,73,0.1)] motion-safe:animate-pulse" />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <Card title="Loading saved roast" description="Fetching the scan record and rebuilding the shareable result view.">
            <div className="space-y-4" role="status" aria-live="polite">
              <div className="h-64 rounded-[var(--radius-md)] bg-[rgba(92,84,73,0.1)] motion-safe:animate-pulse" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-24 rounded-[var(--radius-sm)] bg-[rgba(92,84,73,0.08)] motion-safe:animate-pulse" />
                <div className="h-24 rounded-[var(--radius-sm)] bg-[rgba(92,84,73,0.08)] motion-safe:animate-pulse" />
                <div className="h-24 rounded-[var(--radius-sm)] bg-[rgba(92,84,73,0.08)] motion-safe:animate-pulse" />
                <div className="h-24 rounded-[var(--radius-sm)] bg-[rgba(92,84,73,0.08)] motion-safe:animate-pulse" />
              </div>
            </div>
          </Card>

          <div className="grid gap-6">
            {[0, 1, 2].map((index) => (
              <Card
                key={index}
                title="Loading section"
                description="The audit details are still on their way."
              >
                <div className="space-y-3">
                  <div className="h-20 rounded-[var(--radius-sm)] bg-[rgba(92,84,73,0.08)] motion-safe:animate-pulse" />
                  <div className="h-20 rounded-[var(--radius-sm)] bg-[rgba(92,84,73,0.08)] motion-safe:animate-pulse" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
