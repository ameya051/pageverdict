import type { PropsWithChildren } from "react";
import { Container } from "@/components/shared/Container";
import { cn } from "@/lib/utils";

interface SectionProps extends PropsWithChildren {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}

export function Section({
  eyebrow,
  title,
  description,
  className,
  children,
}: SectionProps) {
  return (
    <section className={cn("py-10 sm:py-14", className)}>
      <Container>
        <div className="mb-6 max-w-3xl">
          {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] sm:text-4xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </Container>
    </section>
  );
}
