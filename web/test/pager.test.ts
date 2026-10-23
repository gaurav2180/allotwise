import { describe, expect, it } from "vitest";
import { pageSlots } from "@/components/pager";

// Pages are zero-based in code; read these as page numbers minus one.
const show = (page: number, pages: number) => pageSlots(page, pages).map((s) => (s === "gap" ? "…" : s + 1)).join(" ");

describe("pageSlots", () => {
  it("lists every page when there are seven or fewer", () => {
    expect(show(0, 1)).toBe("1");
    expect(show(1, 4)).toBe("1 2 3 4");
    expect(show(6, 7)).toBe("1 2 3 4 5 6 7");
  });

  it("keeps first, last, the current page and its neighbours, with gaps between", () => {
    expect(show(4, 10)).toBe("1 … 4 5 6 … 10");
    expect(show(0, 10)).toBe("1 2 3 4 … 10");
    expect(show(9, 10)).toBe("1 … 7 8 9 10");
  });

  it("never hides a single page behind a gap", () => {
    // "1 … 3" would hide only page 2: show it instead.
    expect(show(2, 10)).toBe("1 2 3 4 … 10");
    expect(show(7, 10)).toBe("1 … 7 8 9 10");
  });

  it("stays at seven slots or fewer, so the strip has a fixed width", () => {
    for (let pages = 1; pages <= 40; pages++) {
      for (let page = 0; page < pages; page++) {
        const slots = pageSlots(page, pages);
        expect(slots.length).toBeLessThanOrEqual(7);
        expect(slots).toContain(page);
        expect(slots[0]).toBe(0);
        expect(slots.at(-1)).toBe(pages - 1);
      }
    }
  });
});
