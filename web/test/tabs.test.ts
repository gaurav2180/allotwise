import { describe, expect, it } from "vitest";
import { bucketOf } from "@/components/ipo-list";
import { stateLine } from "@/components/ipo-row";
import { derivePhase } from "@/lib/utils";
import type { IpoListItem } from "@/lib/schemas";

const row = (p: Partial<IpoListItem>) =>
  ({
    slug: "x",
    name: "X",
    board: "sme",
    status: "open",
    openDate: null,
    closeDate: null,
    allotmentDate: null,
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

/** Local time on 16 Oct 2026, the reader's own clock. */
const at = (h: number, m = 0) => new Date(2026, 9, 16, h, m);

// Closed 15 Oct, allotment due 16 Oct: HD Fire Protect and Vaibhav Vyapaar.
const closedYesterday = {
  openDate: "2026-10-13",
  closeDate: "2026-10-15",
  allotmentDate: "2026-10-16",
};

describe("tabs", () => {
  it("keeps an issue in Awaiting on its allotment day until the registrar publishes", () => {
    expect(bucketOf(row(closedYesterday), at(10))).toBe("awaiting");
    expect(bucketOf(row(closedYesterday), at(23, 59))).toBe("awaiting");
  });

  it("moves it to Allotted the moment the registrar has it", () => {
    expect(
      bucketOf(
        row({ ...closedYesterday, allotment: { available: true, ipo: "x" } }),
        at(18),
      ),
    ).toBe("allotted");
  });

  it("moves it to Allotted the day after, even when the registrar is only reachable by link", () => {
    expect(bucketOf(row(closedYesterday), new Date(2026, 9, 17, 0, 1))).toBe(
      "allotted",
    );
  });

  it("keeps an issue at a registrar we check in Awaiting past its date until that registrar publishes", () => {
    // Jio Platforms: KFintech, allotment due 26 Oct, not on KFintech's list the next day.
    const jio = row({ openDate: "2026-10-21", closeDate: "2026-10-23", allotmentDate: "2026-10-26", allotment: { available: false, inApp: true } });
    const oct = (d: number, h = 10) => new Date(2026, 9, d, h);
    expect(bucketOf(jio, oct(27))).toBe("awaiting");
    expect(stateLine(jio, oct(27))).toBe("Awaiting registrar results");
    expect(bucketOf(jio, oct(29, 23))).toBe("awaiting");
    // The backstop: not forever, in case it is filed under a name we miss.
    expect(bucketOf(jio, oct(30))).toBe("allotted");
    // Published: Allotted at once.
    expect(bucketOf({ ...jio, allotment: { available: true, ipo: "jio" } }, oct(27))).toBe("allotted");
  });

  it("counts a listed issue as Allotted whatever its dates say", () => {
    expect(
      bucketOf(row({ ...closedYesterday, listedOn: "2026-10-16" }), at(10)),
    ).toBe("allotted");
  });

  it("is Awaiting with no allotment date announced", () => {
    expect(
      bucketOf(
        row({ openDate: "2026-10-13", closeDate: "2026-10-15" }),
        at(10),
      ),
    ).toBe("awaiting");
  });

  it("is Ongoing through the close date, Awaiting from the next day", () => {
    const closesToday = row({
      openDate: "2026-10-14",
      closeDate: "2026-10-16",
      allotmentDate: "2026-10-19",
    });
    expect(bucketOf(closesToday, at(23, 59))).toBe("ongoing");
    expect(bucketOf(closesToday, new Date(2026, 9, 17, 0, 1))).toBe("awaiting");
  });

  it("is Upcoming until the open date, Ongoing on it", () => {
    const opensTomorrow = row({
      status: "upcoming",
      openDate: "2026-10-17",
      closeDate: "2026-10-21",
    });
    expect(bucketOf(opensTomorrow, at(23, 59))).toBe("upcoming");
    expect(bucketOf(opensTomorrow, new Date(2026, 9, 17, 0, 1))).toBe(
      "ongoing",
    );
  });

  it("reads the reader's date, not UTC", () => {
    // 1 a.m. on the 17th in India is still the 16th in UTC. The issue closed
    // on the 16th, so to the reader it is already closed.
    const oneAm = new Date(2026, 9, 17, 1, 0);
    expect(
      derivePhase({ openDate: "2026-10-14", closeDate: "2026-10-16" }, oneAm),
    ).toBe("closed");
  });
});
