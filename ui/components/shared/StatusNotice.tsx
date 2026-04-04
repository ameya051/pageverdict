import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type StatusTone = "critical" | "warning" | "info" | "success";

interface StatusNoticeProps
  extends HTMLAttributes<HTMLDivElement>,
    PropsWithChildren {
  tone?: StatusTone;
  title?: string;
  description?: string;
  live?: "polite" | "assertive" | "off";
}

const toneClasses: Record<StatusTone, string> = {
  critical: "severity-critical",
  warning: "severity-warning",
  info: "severity-info",
  success:
    "border border-[rgba(61,118,71,0.18)] bg-[rgba(88,140,96,0.12)] text-[rgb(48,96,55)]",
};

export function StatusNotice({
  tone = "info",
  title,
  description,
  children,
  className,
  live = "off",
  ...props
}: StatusNoticeProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] px-4 py-3 text-sm leading-7",
        toneClasses[tone],
        className,
      )}
      aria-live={live}
      {...props}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {description ? <p className={title ? "mt-1" : undefined}>{description}</p> : null}
      {children ? <div className={title || description ? "mt-2" : undefined}>{children}</div> : null}
    </div>
  );
}
