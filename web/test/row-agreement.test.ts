import { describe, expect, it } from "vitest";
import type { IpoListItem } from "@/lib/schemas";
import { bucketOf } from "@/components/ipo-list";
import { rowProblems } from "./helpers/ipo-invariants";

const base = {
  slug: "x",
  name: "X",
  board: "mainboard",
  priceBand: null,
  gmp: null,
  estListingPrice: null,
  estGainPct: null,
  source: "investorgain",
  logo: null,
  listingPrice: null,
  listing: null,
  subscription: null,
  gmpSource: "investorgain",
};

const day = (n: number) => {
  const d = new Date(2026, 9, 1 + n, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Every shape an issue's dates take in practice: openings spread over the
 * month, a one- or four-day window, allotment one or three days after close,
 * listing two after that — each date possibly not announced yet — under every
 * scraped status, with and without the registrar having published.
 */
function* issues(): Generator<IpoListItem> {
  for (const open of [null, 0, 5, 10]) {
    for (const window of [0, 3]) {
      for (const lag of [1, 3]) {
        for (const listLag of [2]) {
          for (const known of ["all", "no-allotment", "no-listing", "status-only"] as const) {
            for (const status of ["upcoming", "open", "closed"]) {
              for (const available of [false, true]) {
                const o = open;
                const c = o === null ? null : o + window;
                const a = c === null ? null : c + lag;
                const l = a === null ? null : a + listLag;
                const dated = known !== "status-only";
                yield {
                  ...base,
                  status,
                  openDate: dated && o !== null ? day(o) : null,
                  closeDate: dated && c !== null ? day(c) : null,
                  allotmentDate: dated && known !== "no-allotment" && a !== null ? day(a) : null,
                  listingDate: dated && known !== "no-listing" && l !== null ? day(l) : null,
                  // As the API sets it: listed once the listing date has come.
                  listedOn: null,
                  allotment: available ? { available: true, ipo: "x" } : { available: false },
                } as IpoListItem;
              }
            }
          }
        }
      }
    }
  }
}

describe("a row agrees with itself on every day of an issue's life", () => {
  it("tab, status line and progress strip never contradict one another", { timeout: 60_000 }, () => {
    const failures: string[] = [];
    let checked = 0;
    const seen = { upcoming: 0, ongoing: 0, awaiting: 0, allotted: 0 };
    for (const ipo of issues()) {
      // Every day from well before opening to well after listing, at the
      // first and last minute of each, where date changes bite.
      for (let d = -3; d <= 22; d++) {
        for (const [h, m] of [[0, 1], [23, 59]]) {
          const now = new Date(2026, 9, 1 + d, h, m);
          const listedOn = ipo.listingDate && ipo.listingDate <= day(d) ? ipo.listingDate : null;
          const problems = rowProblems({ ...ipo, listedOn }, now);
          seen[bucketOf({ ...ipo, listedOn }, now)]++;
          checked++;
          if (problems.length && failures.length < 10) {
            failures.push(`${JSON.stringify({ s: ipo.status, o: ipo.openDate, c: ipo.closeDate, a: ipo.allotmentDate, av: ipo.allotment.available })} on ${now.toString().slice(0, 21)}: ${problems.join("; ")}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(15_000);
    // Every stage was actually reached, so a pass means something.
    for (const n of Object.values(seen)) expect(n).toBeGreaterThan(500);
    expect(failures).toEqual([]);
  });
});
