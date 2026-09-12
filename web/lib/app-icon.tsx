import { ImageResponse } from "next/og";

/**
 * The "partial fill" mark (icon.svg, apple-icon.tsx) at an arbitrary square
 * size, for the manifest icons the Android install prompt reads — those need
 * concrete PNG URLs at specific sizes, not the SVG or the Apple-only file.
 * Proportions are scaled off the original 44-unit SVG so every size matches.
 */
export function appIconResponse(canvas: number) {
  const scale = canvas / 44;
  const square = 12.5 * scale;
  const near = 8 * scale;
  const far = near + 15.5 * scale;
  const radius = 2.5 * scale;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#15151A",
          borderRadius: 10 * scale,
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
