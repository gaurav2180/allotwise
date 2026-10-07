import { describe, expect, it } from "vitest";
import { allotmentOut, describeAllotmentDate, localDate } from "@/lib/utils";

// Built from local parts, as the app reads them, so the tests mean the same
// thing whatever zone they run in.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0);

describe("allotmentOut", () => {
  it("is true on the allotment day itself, and after", () => {
    expect(allotmentOut({ allotmentDate: "2026-10-08" }, at(2026, 10, 8))).toBe(true);
    expect(allotmentOut({ allotmentDate: "2026-10-08" }, at(2026, 10, 9))).toBe(true);
  });

  it("is false before it, and when no date is announced", () => {
    expect(allotmentOut({ allotmentDate: "2026-10-09" }, at(2026, 10, 8))).toBe(false);
    expect(allotmentOut({ allotmentDate: null }, at(2026, 10, 8))).toBe(false);
  });

  it("goes by the reader's own date, not UTC's", () => {
    // 12:30 a.m. on the 8th in the reader's zone: the allotment day has begun,
    // however far behind UTC still is.
    expect(allotmentOut({ allotmentDate: "2026-10-08" }, at(2026, 10, 8, 0))).toBe(true);
    expect(localDate(at(2026, 10, 8, 0))).toBe("2026-10-08");
  });
});

describe("describeAllotmentDate", () => {
  const now = at(2026, 10, 8);

  it("says tomorrow, then days, inside a week", () => {
    expect(describeAllotmentDate("2026-10-09", now)).toBe("tomorrow (Fri, 9 Oct)");
    expect(describeAllotmentDate("2026-10-12", now)).toBe("in 4 days (Mon, 12 Oct)");
    expect(describeAllotmentDate("2026-10-15", now)).toBe("in 7 days (Thu, 15 Oct)");
  });

  it("gives just the date beyond a week", () => {
    expect(describeAllotmentDate("2026-10-16", now)).toBe("Fri, 16 Oct");
  });
});
