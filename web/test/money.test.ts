import { describe, expect, it } from "vitest";
import { capPrice, formatIssueSize, formatPriceBand, minApplication } from "@/lib/utils";

describe("minApplication", () => {
  it("uses two lots for an SME issue, because that is its real minimum", () => {
    // Qualiance: 1,000-share lot, ₹120–127 band, ₹2,54,000 minimum. That is
    // 2,000 shares — two lots. Reading the lot size alone described half the
    // investment the row shows beside it.
    const app = minApplication(1000, 254_000, "₹120 to ₹127 Per Share");
    expect(app).toEqual({ shares: 2000, lots: 2 });

    // The figure a user actually sees: premium on the whole minimum application.
    expect(42 * app!.shares).toBe(84_000);
    // What the old formula gave, on an investment nobody can make.
    expect(42 * 1000).toBe(42_000);
  });

  it("uses one lot for mainboard, where that is the minimum", () => {
    expect(minApplication(8, 14_280, "₹1700 to ₹1785 Per Share")).toEqual({ shares: 8, lots: 1 });
    expect(minApplication(178, 14_952, "₹79 to ₹84 Per Share")).toEqual({ shares: 178, lots: 1 });
    expect(minApplication(35, 14_840, "₹403 to ₹424 Per Share")).toEqual({ shares: 35, lots: 1 });
    expect(minApplication(161, 14_973, "₹88-93")).toEqual({ shares: 161, lots: 1 });
  });

  it("derives the multiple rather than assuming one or two", () => {
    expect(minApplication(100, 3 * 100 * 50, "₹45-50")?.lots).toBe(3);
  });

  it("shows nothing when the figures do not reconcile", () => {
    // A minimum investment that is not a whole number of lots at the cap price
    // means the three values are not describing the same issue. A missing row
    // beats a wrong one when the number is money.
    expect(minApplication(1000, 999_999, "₹120-127")).toBeNull();
    expect(minApplication(null, 254_000, "₹120-127")).toBeNull();
    expect(minApplication(1000, null, "₹120-127")).toBeNull();
    expect(minApplication(1000, 254_000, null)).toBeNull();
    expect(minApplication(1000, 254_000, "₹-")).toBeNull();
    expect(minApplication(0, 254_000, "₹120-127")).toBeNull();
  });

  it("prices at the cap, which is what applications are made at", () => {
    expect(capPrice("₹120 to ₹127 Per Share")).toBe(127);
    expect(capPrice("₹1,700-1,785")).toBe(1785);
    expect(capPrice("₹104")).toBe(104);
    expect(capPrice("₹-")).toBeNull();
    expect(capPrice(null)).toBeNull();
  });
});

describe("issue size and price band stay the published figures", () => {
  it("never presents a share count as an amount", () => {
    expect(formatIssueSize("2,24,63,137 shares")).toBeNull();
    expect(formatIssueSize("₹45.11 Cr")).toBe("₹45.11 Cr");
    expect(formatIssueSize("Approx ₹45.11 Crores")).toContain("45.11");
  });

  it("drops a band with no numbers rather than rendering the placeholder", () => {
    expect(formatPriceBand("₹[.] to ₹[.] Per Share")).toBeNull();
    expect(formatPriceBand("₹-")).toBeNull();
    expect(formatPriceBand("₹120-127")).toBe("₹120–₹127");
    expect(formatPriceBand("₹104")).toBe("₹104");
  });
});

describe("listing outcome supersedes the forecast", () => {
  // Mirrors listingFrom in app/api/ipos/route.ts: applications are priced at the
  // cap, so that is what a debut price is measured against.
  const gain = (listingPrice: number, band: string) => {
    const issuePrice = capPrice(band)!;
    return Number((((listingPrice - issuePrice) / issuePrice) * 100).toFixed(2));
  };

  it("reports the real result, including a loss", () => {
    // Every one of these was showing a stale premium or a dash.
    expect(gain(81.6, "₹102")).toBe(-20);
    expect(gain(224.9, "₹120-127")).toBe(77.09);
    expect(gain(112.1, "₹59")).toBe(90);
    expect(gain(56, "₹51-54")).toBe(3.7);
    expect(gain(221, "₹168-177")).toBe(24.86);
    expect(gain(239, "₹227-239")).toBe(0);
  });

  it("measures against the cap, not the floor", () => {
    // Against the floor this would read +9.4%, which is not what an applicant
    // paid: allocations are made at the cap.
    expect(gain(140, "₹87-92")).toBe(52.17);
  });
});
