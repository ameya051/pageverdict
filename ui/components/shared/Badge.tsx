import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "critical" | "warning" | "info" | "success";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const badgeVariants: Record<BadgeVariant, string> = {
  default:
    "border border-[color:var(--border-soft)] bg-white/70 text-[var(--text-secondary)]",
  critical: "severity-critical border border-transparent",
  warning: "severity-warning border border-transparent",
  info: "severity-info border border-transparent",
  success:
    "border border-transparent bg-[rgba(88,140,96,0.15)] text-[rgb(48,96,55)]",
};

export function Badge({
  variant = "default",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.16em]",
        badgeVariants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
