"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface TabOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * Sliding tab indicator: 250ms, cubic-bezier(.22,1,.36,1).
 *
 * The indicator is measured from the active button rather than assuming equal
 * widths, because the labels carry counts and are not uniform.
 */
export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const active = list.querySelector<HTMLButtonElement>(`[data-value="${value}"]`);
      if (!active) return;
      setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
      // On a phone the strip scrolls horizontally, so a tab near the end can sit
      // off-screen. Bring the selected one into view rather than leaving the
      // user to discover the scroll.
      active.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [value, options]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className="relative inline-flex items-center gap-0.5 rounded-pill border border-border bg-surface p-0.5"
      onKeyDown={(e) => {
        // Arrow keys move between tabs, as expected of a tablist.
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const next = e.key === "ArrowRight" ? (i + 1) % options.length : (i - 1 + options.length) % options.length;
        onChange(options[next].value);
      }}
    >
      {indicator && (
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 rounded-pill"
          style={{
            left: indicator.left,
            width: indicator.width,
            background: "var(--chip-bg)",
            transition: "left var(--dur-tab) var(--ease-slide), width var(--dur-tab) var(--ease-slide)",
          }}
        />
      )}

      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            data-value={o.value}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              // Still a thumb target on a phone, but 36 rather than the 44 this
              // used to be — at 44 the strip stood 54px tall and read as a
              // toolbar rather than a filter. Compact again once there is a
              // pointer.
              "relative z-1 inline-flex min-h-9 items-center rounded-pill px-3 text-[13px] font-medium whitespace-nowrap sm:min-h-0",
              "sm:px-3 sm:py-1",
              "transition-colors duration-150",
              active ? "text-text" : "text-dim hover:text-text"
            )}
          >
            {o.label}
            {o.count !== undefined && (
              // On the active tab the count sits on the chip fill, where `dim`
              // falls just under 4.5:1. Inactive tabs sit on surface, where it
              // passes — so the tone follows the state rather than the palette
              // being changed.
              <span className={cn("num ml-1.5 text-[12px]", active ? "text-text" : "text-dim")}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
