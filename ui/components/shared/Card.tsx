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
        "surface-card rounded-[var(--radius-md)] p-5 sm:p-6",
        className,
      )}
      {...props}
    >
      {title || description || aside ? (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
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
