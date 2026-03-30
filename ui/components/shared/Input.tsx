import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-[var(--radius-pill)] border border-[color:var(--border-strong)] bg-white/80 px-4 py-3 text-base text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)]",
        "focus:border-[color:var(--accent)] focus:bg-white focus:ring-4 focus:ring-[rgba(196,92,43,0.12)]",
        className,
      )}
      {...props}
    />
  );
}
