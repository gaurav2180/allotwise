"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        // 16px on mobile: iOS Safari zooms the whole page when a focused input
        // is under 16px. Scales down to 14px once there is a pointer.
        "h-10 w-full rounded-control border bg-surface px-3 text-base sm:h-9 sm:text-sm",
        "placeholder:text-dim",
        "transition-[border-color] duration-150",
        invalid ? "border-negative" : "border-border",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        // Same treatment as Input (16px on mobile, resize disabled so it can't
        // be dragged wider than the form column it lives in).
        "w-full resize-y rounded-control border bg-surface px-3 py-2.5 text-base sm:text-sm",
        "placeholder:text-dim",
        "transition-[border-color] duration-150",
        invalid ? "border-negative" : "border-border",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-[13px] font-medium text-text", className)} {...props} />;
}

/** Error text is tied to the field with aria-describedby by the caller. */
export function FieldError({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[12px]" style={{ color: "var(--negative)" }}>
      {children}
    </p>
  );
}
