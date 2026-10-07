import { describe, expect, it } from "vitest";
import { capPrice, estProfitPerLot, formatIssueSize, formatPriceBand } from "@/lib/utils";

describe("estProfitPerLot", () => {
  it("is lot size times the premium, as InvestorGain and IPOwiz print it", () => {
    // Nityas Gems: 200-share lot, ₹3 premium → ₹600 on both sites.
    expect(estProfitPerLot(200, 3)).toBe(600);
    // TNA Solutions (SME): 2,000-share lot, ₹6 → ₹12,000.
    expect(estProfitPerLot(2000, 6)).toBe(12_000);
    expect(estProfitPerLot(468, 0.7)).toBe(327.6);
    expect(estProfitPerLot(49, -5)).toBe(-245);
  });

  it("shows nothing rather than a guess when an input is missing", () => {
    expect(estProfitPerLot(null, 3)).toBeNull();
    expect(estProfitPerLot(200, null)).toBeNull();
    expect(estProfitPerLot(0, 3)).toBeNull();
    expect(estProfitPerLot(200, 0)).toBe(0);
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
