"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A hand-built listbox, not a native <select> — the native element's open
 * panel is drawn by the OS/browser and cannot be reached by our CSS, so it
 * ignores dark mode entirely. This one is themed the same as everything
 * else, at the cost of building the open/close and keyboard handling
 * ourselves rather than getting them for free.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  /** Accessible name — there is no visible <label> beside the trigger. */
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const current = options.find((o) => o.value === value) ?? options[0];

  // Outside click / focus leaving the whole control closes it — a listbox
  // left open behind other UI is a common source of "why won't this click".
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Opening focuses the current option, so arrow keys work immediately
  // without an extra keypress to "enter" the list.
  useEffect(() => {
    if (open) optionRefs.current[selectedIndex]?.focus();
  }, [open, selectedIndex]);

  function select(next: T) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onOptionKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      optionRefs.current[Math.min(index + 1, options.length - 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      optionRefs.current[Math.max(index - 1, 0)]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-pill border border-border bg-surface py-1 pr-2.5 pl-3 text-[12px] font-medium text-text transition-colors duration-150 hover:border-dim sm:h-7"
      >
        {current.label}
        <CaretDownIcon
          size={11}
          weight="bold"
          aria-hidden
          className={cn("text-dim transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="aw-pop-in absolute top-full left-0 z-20 mt-1.5 min-w-full overflow-hidden rounded-control border border-border bg-surface py-1 shadow-lg"
        >
          {options.map((o, i) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => select(o.value)}
                onKeyDown={(e) => onOptionKeyDown(e, i)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] whitespace-nowrap transition-colors duration-100",
                  active ? "font-medium text-text" : "text-dim hover:bg-row-hover hover:text-text"
                )}
              >
                {o.label}
                {active && <CheckIcon size={13} weight="bold" aria-hidden style={{ color: "var(--accent)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
