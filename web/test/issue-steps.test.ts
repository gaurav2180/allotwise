import { describe, expect, it } from "vitest";
import { issueSteps } from "@/components/awaiting-allotment";
import type { IpoListItem } from "@/lib/schemas";

const row = (p: Partial<IpoListItem>) =>
  ({
    slug: "x",
    name: "X",
    board: "mainboard",
    status: "upcoming",
    openDate: null,
    closeDate: null,
    allotmentDate: null,
    listingDate: null,
    priceBand: null,
    gmp: null,
    estListingPrice: null,
    estGainPct: null,
    source: "investorgain",
    logo: null,
    listingPrice: null,
    listedOn: null,
    listing: null,
    subscription: null,
    gmpSource: "investorgain",
    allotment: { available: false },
    ...p,
  }) as IpoListItem;

const at = (d: number, h = 12) => new Date(2026, 9, d, h);
const states = (ipo: IpoListItem, now: Date) => issueSteps(ipo, now).map((s) => `${s.label}:${s.state}`);

// Jio Platforms: opens 21 Oct, closes 23, allotment 26, lists 28.
const jio = row({ openDate: "2026-10-21", closeDate: "2026-10-23", allotmentDate: "2026-10-26", listingDate: "2026-10-28" });

describe("issue steps", () => {
  it("shows an issue that has not opened as not opened — nothing ticked", () => {
    expect(states(jio, at(16))).toEqual(["Opens:now", "Closes:next", "Allotment:next", "Listing:next"]);
  });

  it("ticks opening once it is open, and the close is what is under way", () => {
    expect(states(jio, at(22))).toEqual(["Opened:done", "Closes:now", "Allotment:next", "Listing:next"]);
    expect(states(jio, at(23, 23))).toEqual(["Opened:done", "Closes:now", "Allotment:next", "Listing:next"]);
  });

  it("ticks the close the day after, with allotment under way", () => {
    expect(states(jio, at(24, 0))).toEqual(["Opened:done", "Closed:done", "Allotment:now", "Listing:next"]);
    expect(states(jio, at(26))).toEqual(["Opened:done", "Closed:done", "Allotment:now", "Listing:next"]);
  });

  it("says TBA for dates not announced, and Today / Tomorrow nearby", () => {
    const steps = issueSteps(row({ openDate: "2026-10-17" }), at(16));
    expect(steps.map((s) => s.when)).toEqual(["Tomorrow", "TBA", "TBA", "TBA"]);
    expect(issueSteps(jio, at(23))[1].when).toBe("Today");
  });
});
