import { describe, expect, it } from "vitest";
import { compareAllotted, compareOngoing, compareSearch, compareUpcoming } from "@/components/ipo-list";
import type { IpoListItem } from "@/lib/schemas";

/** Only the fields the comparators read; the rest of the row is irrelevant here. */
const row = (p: Partial<IpoListItem> & { name: string }) =>
  ({
    slug: p.name.toLowerCase().replace(/\s+/g, "-"),
    board: "sme",
    status: "open",
    openDate: null,
    closeDate: null,
    priceBand: null,
    gmp: null,
    estListingPrice: null,
    estGainPct: null,
    source: "ipoji",
    logo: null,
    listingPrice: null,
    listedOn: null,
    listing: null,
    subscription: null,
    gmpSource: "ipoji",
    allotment: { available: false },
    ...p,
  }) as IpoListItem;

const names = (rows: IpoListItem[], cmp: (a: IpoListItem, b: IpoListItem) => number) =>
  [...rows].sort(cmp).map((r) => r.name);

describe("Ongoing", () => {
  it("puts open issues first, closing soonest", () => {
    // Ranking by premium produced "closes in 3d, 3d, 4d, 4d, 3d" down the page.
    const rows = [
      row({ name: "Closes 4d", openDate: "2026-09-11", closeDate: "2026-09-16", gmp: 99 }),
      row({ name: "Closes 3d", openDate: "2026-09-10", closeDate: "2026-09-15", gmp: 1 }),
      row({ name: "Closes 1d", openDate: "2026-09-09", closeDate: "2026-09-13", gmp: null }),
    ];
    expect(names(rows, compareOngoing)).toEqual(["Closes 1d", "Closes 3d", "Closes 4d"]);
  });

  it("puts issues awaiting allotment after the ones still open", () => {
    const rows = [
      row({ name: "Closed recently", openDate: "2026-09-01", closeDate: "2026-09-09" }),
      row({ name: "Still open", openDate: "2026-09-10", closeDate: "2026-09-15" }),
      row({ name: "Closed a while ago", openDate: "2026-08-20", closeDate: "2026-09-02" }),
    ];
    // Applying is still possible on the first; the others are only waiting.
    expect(names(rows, compareOngoing)).toEqual([
      "Still open",
      "Closed recently",
      "Closed a while ago",
    ]);
  });
});

describe("Upcoming", () => {
  it("orders by open date and sinks issues with no date announced", () => {
    // Jio and PhonePe have no band or dates yet. Sorting a null as "" would
    // float them above an issue opening tomorrow.
    const rows = [
      row({ name: "PhonePe", status: "upcoming" }),
      row({ name: "Opens later", status: "upcoming", openDate: "2026-09-20" }),
      row({ name: "Opens tomorrow", status: "upcoming", openDate: "2026-09-13" }),
      row({ name: "Jio Platforms", status: "upcoming" }),
    ];
    expect(names(rows, compareUpcoming)).toEqual([
      "Opens tomorrow",
      "Opens later",
      // Undated, alphabetical between themselves so the order is stable.
      "Jio Platforms",
      "PhonePe",
    ]);
  });
});

describe("Allotted", () => {
  it("puts allotment-out-not-yet-listed above already-listed", () => {
    const rows = [
      row({ name: "Listed recently", closeDate: "2026-09-05", listedOn: "2026-09-11" }),
      row({ name: "Allotment out", closeDate: "2026-09-08", allotment: { available: true } }),
      row({ name: "Listed a while ago", closeDate: "2026-08-30", listedOn: "2026-09-07" }),
    ];
    // The first still has a listing ahead of it; the others are history.
    expect(names(rows, compareAllotted)).toEqual([
      "Allotment out",
      "Listed recently",
      "Listed a while ago",
    ]);
  });
});

describe("Search", () => {
  it("orders across every tab: live, then coming, then done", () => {
    const rows = [
      row({ name: "Done", closeDate: "2026-09-02", listedOn: "2026-09-08" }),
      row({ name: "Coming", status: "upcoming", openDate: "2026-09-20" }),
      row({ name: "Live", openDate: "2026-09-10", closeDate: "2026-09-15" }),
    ];
    expect(names(rows, compareSearch)).toEqual(["Live", "Coming", "Done"]);
  });
});

describe("every comparator", () => {
  const all = [compareOngoing, compareUpcoming, compareAllotted, compareSearch];

  it("is stable on identical dates, so rows do not jitter between renders", () => {
    const rows = [
      row({ name: "Zeta", openDate: "2026-09-10", closeDate: "2026-09-15" }),
      row({ name: "Alpha", openDate: "2026-09-10", closeDate: "2026-09-15" }),
      row({ name: "Mid", openDate: "2026-09-10", closeDate: "2026-09-15" }),
    ];
    for (const cmp of all) {
      expect(names(rows, cmp)).toEqual(["Alpha", "Mid", "Zeta"]);
      // Same answer whatever order the API returned them in.
      expect(names([...rows].reverse(), cmp)).toEqual(["Alpha", "Mid", "Zeta"]);
    }
  });

  it("never drops or duplicates a row", () => {
    const rows = [
      row({ name: "A", openDate: "2026-09-10", closeDate: "2026-09-15" }),
      row({ name: "B", status: "upcoming" }),
      row({ name: "C", closeDate: "2026-09-01", listedOn: "2026-09-06" }),
      row({ name: "D" }),
    ];
    for (const cmp of all) {
      const out = names(rows, cmp);
      expect(out).toHaveLength(rows.length);
      expect(new Set(out).size).toBe(rows.length);
    }
  });
});
