Allotwise brand assets
=======================

mark-black.svg / mark-white.svg
  The glyph alone, transparent background — a 2x2 grid of rounded squares,
  three filled and one left open ("allotment is never all-or-nothing").
  Use mark-black on light backgrounds, mark-white on dark ones.

lockup-black.svg / lockup-white.svg
  Glyph + "Allotwise" wordmark, same color logic as above. "Allot" is
  semibold, "wise" sits back in a dimmer gray.

favicon-tile.svg
  The glyph on its own dark rounded-square background (#15151A), fixed
  colors — this is the actual favicon/browser-tab icon, not a theme-aware
  asset like the others.

app-icon-180.png / app-icon-192.png / app-icon-512.png
  The same tile, rendered as PNG at the sizes iOS/Android home-screen
  icons and PWA manifests need (180 = Apple touch icon, 192 and 512 =
  the two sizes the web app manifest declares).

All colors are the exact tokens from the app's design system:
  ink/dark   #15151A
  off-white  #F0F0EE
  dim gray   #6B6B72 (light) / #94949C (dark)

There's no colored/gradient version — the mark is deliberately single-
color (currentColor in the live UI), by design.
