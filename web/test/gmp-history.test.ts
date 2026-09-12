import { describe, expect, it } from "vitest";
import { parseGmpHistory } from "@/lib/ipoji-gmp";

/** One row of IPO Ji's day-wise table. `stamp` is the UTC instant it publishes. */
const row = (stamp: string, gmp: number, change: string, pct: string, indicative: number) => `
  <tr>
    <td data-label="Date"><time datetime="${stamp}">x</time></td>
    <td data-label="GMP">+₹${gmp}</td>
    <td data-label="Change">${change}</td>
    <td data-label="GMP %">${pct}</td>
    <td data-label="Indicative Listing">₹${indicative}</td>
  </tr>`;

const table = (rows: string) => `<table class="gmp-history-table">${rows}</table>`;

describe("parseGmpHistory", () => {
  it("returns one point per day, newest reading winning", () => {
    // IPO Ji requotes through the day. Each reading became its own point, so the
    // same date appeared three times on the axis and the line doubled back
    // between them.
    const html = table(
      row("2026-09-06T14:00:00.000Z", 42, "+₹2", "+33%", 169) +
        row("2026-09-06T11:00:00.000Z", 40, "₹0", "+31%", 167) +
        row("2026-09-06T05:00:00.000Z", 40, "₹0", "+31%", 167) +
        row("2026-09-05T14:15:00.000Z", 38, "+₹5", "+30%", 165)
    );

    const points = parseGmpHistory(html);
    expect(points.map((p) => p.date)).toEqual(["2026-09-05", "2026-09-06"]);
    expect(points[1].gmp).toBe(42);
  });

  it("dates a reading by its Indian day, not its UTC one", () => {
    // 19:30 UTC is 01:00 the next morning in Delhi, and IPO Ji's own Date column
    // says so. Slicing the ISO string filed those quotes a day early.
    const points = parseGmpHistory(table(row("2026-09-11T19:30:00.000Z", 10, "—", "+12%", 94)));
    expect(points[0].date).toBe("2026-09-12");

    // A midday quote is unaffected, which is why this went unnoticed.
    expect(parseGmpHistory(table(row("2026-09-11T06:00:00.000Z", 10, "—", "+12%", 94)))[0].date).toBe(
      "2026-09-11"
    );
  });

  it("orders oldest first and recomputes change against the previous day", () => {
    // The published Change is the move since the previous *row*, which may be
    // earlier the same day — not the step the chart draws once days are
    // collapsed.
    const points = parseGmpHistory(
      table(
        row("2026-09-12T11:30:00.000Z", 16, "+₹6", "+19%", 100) +
          row("2026-09-11T16:15:00.000Z", 10, "+₹2", "+12%", 94) +
          row("2026-09-10T18:00:00.000Z", 8, "—", "+10%", 92)
      )
    );

    expect(points.map((p) => p.date)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
    expect(points.map((p) => p.gmp)).toEqual([8, 10, 16]);
    expect(points.map((p) => p.change)).toEqual([null, 2, 6]);
  });

  it("never emits a duplicate or out-of-order date", () => {
    const points = parseGmpHistory(
      table(
        row("2026-09-02T10:00:00.000Z", 17, "—", "+14%", 141) +
          row("2026-09-08T10:00:00.000Z", 30, "+₹13", "+24%", 154) +
          row("2026-09-04T10:00:00.000Z", 20, "+₹3", "+16%", 144) +
          row("2026-09-08T06:00:00.000Z", 28, "₹0", "+23%", 152)
      )
    );

    const dates = points.map((p) => p.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
    // A gap stays a gap — the chart plots against the timestamp, so 4 Sep to
    // 8 Sep is drawn twice as wide as 2 Sep to 4 Sep rather than identically.
    expect(dates).toEqual(["2026-09-02", "2026-09-04", "2026-09-08"]);
  });

  it("is empty rather than wrong when there is no table", () => {
    expect(parseGmpHistory("<html><body>no history here</body></html>")).toEqual([]);
    expect(parseGmpHistory(table(""))).toEqual([]);
  });
});
