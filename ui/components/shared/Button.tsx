import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-[var(--accent)] text-[var(--accent-contrast)] hover:-translate-y-px hover:bg-[var(--accent-strong)]",
  secondary:
    "border-[color:var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:-translate-y-px hover:border-[color:var(--accent-muted)] hover:bg-white/95",
  ghost:
    "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-white/60 hover:text-[var(--text-primary)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3.5 py-2 text-sm",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-base",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] border font-semibold shadow-[var(--shadow-sm)] transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(196,92,43,0.18)] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  pending = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonStyles({ variant, size, className })}
      disabled={disabled || pending}
      aria-busy={pending}
      {...props}
    >
      {pending ? (
        <span className="h-2 w-2 rounded-full bg-current opacity-80 motion-safe:animate-pulse" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}
