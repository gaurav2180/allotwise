"use client";

import { useState } from "react";

/** "Purple Style Labs" -> "PS"; single-word names take two letters. */
export function monogram(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Logo tile. Roughly one in five issues has no logo upstream and some URLs
 * 404, so the monogram is a first-class state rather than an error — it is what
 * renders on miss, on failure, and while nothing has loaded.
 */
export function IpoLogo({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-control border border-border"
      // Company marks are drawn for light grounds, so the tile carries one in
      // both themes — the same treatment the buttons and the logo mark use.
      // Without it, dark artwork disappears against the dark page.
      style={{ background: showImage ? "#FFFFFF" : "var(--chip-bg)" }}
      aria-hidden
    >
      {showImage ? (
        // Plain img: the source host is third-party and occasionally 404s, and
        // onError fallback matters more here than the optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-contain p-0.5"
          onError={() => setFailed(true)}
        />
      ) : (
        // Full-strength: with no logo this IS the company identifier, and `dim`
        // on the chip fill sits under 4.5:1.
        <span className="num text-[11px] font-medium text-text">{monogram(name)}</span>
      )}
    </span>
  );
}
