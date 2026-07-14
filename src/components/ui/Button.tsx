"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "icon";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** For icon-only buttons, an accessible label is mandatory (enforced by the type system). */
  "aria-label"?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-brand hover:bg-primary-hover disabled:bg-line disabled:text-ink-muted",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-surface-sunken disabled:text-ink-muted disabled:border-line",
  ghost: "bg-transparent text-ink hover:bg-surface-sunken disabled:text-ink-muted",
  destructive: "bg-danger text-on-brand hover:opacity-90 disabled:bg-line disabled:text-ink-muted",
  icon: "bg-transparent text-ink-secondary hover:bg-surface-sunken hover:text-ink disabled:text-ink-muted",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

const ICON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

/**
 * Button — Deliverable 3.1
 * Purpose: trigger a single action.
 * Variants: Primary, Secondary, Tertiary/Ghost, Destructive, Icon-only.
 * States: Default, Hover, Active, Disabled, Loading (button disables itself and
 * shows an inline spinner while `loading` is true — never a separate page-level spinner).
 * Usage rule: exactly one Primary button per view; Destructive always requires confirmation
 * (pair with the Dialog component).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, ...props },
  ref
) {
  const isIcon = variant === "icon";
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors duration-[var(--dur-micro)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed active:scale-[0.98]",
        VARIANT_CLASSES[variant],
        isIcon ? ICON_SIZE_CLASSES[size] : SIZE_CLASSES[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
});
