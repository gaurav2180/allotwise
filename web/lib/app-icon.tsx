import { ImageResponse } from "next/og";

/**
 * The "partial fill" mark (icon.svg, apple-icon.tsx) at an arbitrary square
 * size, for the manifest icons the Android install prompt reads — those need
 * concrete PNG URLs at specific sizes, not the SVG or the Apple-only file.
 * Proportions are scaled off the original 44-unit SVG so every size matches.
 *
 * `maskable` is the variant Android crops to its own shape (circle, squircle):
 * full-bleed with no rounded corners to show as gaps, and the glyph shrunk to
 * 85% so its corners stay inside the safe circle every mask keeps.
 */
export function appIconResponse(canvas: number, { maskable = false } = {}) {
  const unit = canvas / 44;
  const scale = maskable ? unit * 0.85 : unit;
  const square = 12.5 * scale;
  // The glyph spans 8..36 of the 44-unit tile; centred whatever its scale.
  const near = canvas / 2 - 14 * scale;
  const far = near + 15.5 * scale;
  const radius = 2.5 * scale;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#15151A",
          borderRadius: maskable ? 0 : 10 * unit,
          position: "relative",
          display: "flex",
        }}
      >
        <div style={{ position: "absolute", left: near, top: near, width: square, height: square, borderRadius: radius, background: "#F0F0EE" }} />
        <div style={{ position: "absolute", left: far, top: near, width: square, height: square, borderRadius: radius, background: "#F0F0EE" }} />
        <div style={{ position: "absolute", left: near, top: far, width: square, height: square, borderRadius: radius, background: "#F0F0EE" }} />
        <div
          style={{
            position: "absolute",
            left: far,
            top: far,
            width: square,
            height: square,
            borderRadius: radius,
            border: `${2 * scale}px solid #F0F0EE`,
            boxSizing: "border-box",
          }}
        />
      </div>
    ),
    { width: canvas, height: canvas }
  );
}
