"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/shared/Button";

interface RetryButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export function RetryButton({
  children = "Try again",
  variant = "primary",
  size = "md",
  className,
}: RetryButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      pending={isPending}
      className={className}
      onClick={() => {
        setIsPending(true);
        router.refresh();
        window.setTimeout(() => {
          setIsPending(false);
        }, 1200);
      }}
    >
      {children}
    </Button>
  );
}
