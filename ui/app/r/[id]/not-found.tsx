import Link from "next/link";
import { RetryButton } from "@/components/shared/RetryButton";
import { buttonStyles } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Container } from "@/components/shared/Container";
import { StatusNotice } from "@/components/shared/StatusNotice";

export default function ScanNotFound() {
  return (
    <main className="page-shell pb-20 pt-8 sm:pt-12">
      <Container>
        <Card
          title="Scan not found"
          description="That result link is missing, malformed, or not ready yet."
        >
          <StatusNotice
            tone="warning"
            description="If you just finished a scan, give it a moment and retry. A failed midway scan can also land you here before the shareable record is saved."
          />
          <div className="flex flex-wrap gap-3">
            <RetryButton size="lg">Retry this result</RetryButton>
            <Link href="/" className={buttonStyles({ variant: "primary", size: "lg" })}>
              Roast a landing page
            </Link>
          </div>
        </Card>
      </Container>
    </main>
  );
}
