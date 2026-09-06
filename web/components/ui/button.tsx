"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "quiet" | "ghost";
type Size = "sm" | "md";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * Primary is the white-surface / black-text mark from DESIGN.md. In light mode
 * it carries a hairline border or it vanishes into the off-white page; in dark
 * mode the border is dropped (both come from the component token layer).
 */
const VARIANTS: Record<Variant, string> = {
  primary: "border [background:var(--btn-bg)] [color:var(--btn-text)] [border-color:var(--btn-border)] hover:brightness-95",
  quiet: "border border-border bg-surface text-text hover:bg-row-hover",
  ghost: "border border-transparent bg-transparent text-dim hover:text-text hover:bg-row-hover",
};

// Mobile-first: still a thumb target, tightened once there is a pointer. 40px
// rather than the 44px ideal — at 44 the controls visibly dominated a phone
// screen, and 40 keeps a comfortable target without the bulk. Text links keep
// their invisible `min-h-11` padding, so nothing loses tap area to this.
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] sm:h-8 sm:px-3",
  md: "h-10 px-4 text-sm sm:h-9",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "quiet", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium",
        "transition-[background-color,border-color,filter,transform] duration-150",
        "active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
