import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement>, PropsWithChildren {
  title?: string;
  description?: string;
  aside?: ReactNode;
}

export function Card({
  title,
  description,
  aside,
  children,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "surface-card rounded-[var(--radius-md)] p-5 motion-safe:animate-[rise-in_420ms_ease-out] sm:p-6",
        className,
      )}
      {...props}
    >
      {title || description || aside ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
          {aside}
        </div>
      ) : null}
      {children}
    </div>
  );
}
