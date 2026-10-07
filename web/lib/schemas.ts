import { z } from "zod";

/**
 * Schemas mirror the Express backend's actual responses, verified against live
 * payloads. Parsing at the boundary means a registrar or scraper change surfaces
 * as one legible error instead of `undefined` deep inside a component.
 */

export const boardSchema = z.enum(["mainboard", "sme"]);
export const ipoStatusSchema = z.enum(["upcoming", "open", "closed", "listed", "unknown"]);

/** Row from GET /calendar. `gmp` is 0 (not null) when a source reports no premium. */
export const calendarRowSchema = z.object({
  slug: z.string(),
  name: z.string(),
  board: boardSchema,
  status: ipoStatusSchema,
  openDate: z.string().nullable(),
  closeDate: z.string().nullable(),
  allotmentDate: z.string().nullable().default(null),
  listingDate: z.string().nullable().default(null),
  priceBand: z.string().nullable(),
  lotSize: z.number().nullable().default(null),
  issueSize: z.string().nullable().default(null),
  gmp: z.number().nullable(),
  estListingPrice: z.number().nullable(),
  estGainPct: z.number().nullable(),
  // Overall times subscribed, as the source reports it.
  subscription: z.number().nullable().default(null),
  source: z.string(),
  gmpSource: z.string().nullable().default(null),
  // The source's own "updated" stamp for the premium, e.g. "2-Oct 11:37".
  sourceUpdatedAt: z.string().nullable().default(null),
  logo: z.string().nullable().default(null),
  // What the share actually opened at. Present only after listing, and the
  // figure that supersedes the premium once it is.
  listingPrice: z.number().nullable().default(null),
  allotment: z.object({
    available: z.boolean(),
    // Present only when available — and it is the REGISTRAR slug, which differs
    // from the market slug (`esds-software` vs `esds-software-solution-ipo`).
    ipo: z.string().optional(),
  }),
  // The issue's registrar and its own allotment-status page, for checking by
  // hand when the in-app check is not available for this issue.
  registrar: z
    .object({ name: z.string().nullable(), url: z.string().nullable() })
    .nullable()
    .default(null),
});

export const calendarSchema = z.object({
  count: z.number(),
  ipos: z.array(calendarRowSchema),
  attribution: z.array(z.string()).default([]),
});

export const subscriptionCategorySchema = z.object({
  category: z.string(),
  sharesOffered: z.number().nullable(),
  sharesBid: z.number().nullable(),
  timesSubscribed: z.number().nullable(),
  source: z.string().optional(),
  sourceUpdatedAt: z.string().nullable().optional(),
});

export const subscriptionSchema = z.object({
  slug: z.string(),
  overall: z.number().nullable(),
  categories: z.array(subscriptionCategorySchema),
  source: z.string(),
  note: z.string().optional(),
});

/** What the composed /api/ipos handler returns to the browser. */
export const ipoListItemSchema = calendarRowSchema.extend({
  subscription: z
    .object({
      overall: z.number().nullable(),
      categories: z.array(subscriptionCategorySchema),
    })
    .nullable(),
  // Resolved best-effort; null falls back to a monogram tile.
  logo: z.string().nullable().default(null),
  // Present only once the issue has actually listed. Its existence is the
  // signal that the row should show an outcome instead of a forecast.
  listing: z
    .object({
      price: z.number(),
      issuePrice: z.number(),
      gainPct: z.number(),
    })
    .nullable()
    .default(null),
  // Set when the listing date has arrived, independent of whether the debut
  // price has been published — an issue lists before the outcome is known.
  listedOn: z.string().nullable().default(null),
  gmpSource: z.string().default("investorgain"),
});

export const ipoListSchema = z.object({
  count: z.number(),
  ipos: z.array(ipoListItemSchema),
  attribution: z.array(z.string()),
});

/** Full record for one IPO, from /api/ipo/[slug]. Every field is nullable —
 *  detail pages fill in gradually as an issue firms up. */
export const ipoDetailSchema = z.object({
  slug: z.string(),
  name: z.string(),
  board: boardSchema,
  status: ipoStatusSchema,
  timeline: z.object({
    openDate: z.string().nullable(),
    closeDate: z.string().nullable(),
    allotmentDate: z.string().nullable(),
    refundDate: z.string().nullable(),
    listingDate: z.string().nullable(),
  }),
  details: z.object({
    priceBand: z.string().nullable(),
    issueSize: z.string().nullable(),
    lotSize: z.number().nullable(),
    listingExchanges: z.string().nullable(),
  }),
  gmp: z.array(
    z.object({
      value: z.number().nullable(),
      estListingPrice: z.number().nullable(),
      estGainPct: z.number().nullable(),
    })
  ),
});

export type IpoDetail = z.infer<typeof ipoDetailSchema>;

/** Day-wise grey market premium for one IPO, oldest first, from the source's own table. */
export const gmpHistorySchema = z.object({
  slug: z.string(),
  name: z.string(),
  headline: z.number().nullable(),
  updatedAt: z.string().nullable().default(null),
  source: z.string(),
  history: z.array(
    z.object({
      date: z.string(),
      gmp: z.number(),
      pct: z.number().nullable(),
      indicative: z.number().nullable(),
      profit: z.number().nullable(),
      change: z.number().nullable(),
    })
  ),
});

export type GmpHistory = z.infer<typeof gmpHistorySchema>;

export type Board = z.infer<typeof boardSchema>;
export type IpoStatus = z.infer<typeof ipoStatusSchema>;
export type IpoListItem = z.infer<typeof ipoListItemSchema>;
export type IpoList = z.infer<typeof ipoListSchema>;
export type SubscriptionCategory = z.infer<typeof subscriptionCategorySchema>;

/* ---------------------------------------------------------------- allotment */

export const allotmentApplicationSchema = z.object({
  applicationNumber: z.string().nullable(),
  applicantName: z.string().nullable(),
  dpClientId: z.string().nullable(),
  sharesApplied: z.number(),
  sharesAllotted: z.number(),
  status: z.enum(["allotted", "partially_allotted", "not_allotted"]),
});

export const allotmentSummarySchema = z.object({
  status: z.enum(["allotted", "partially_allotted", "not_allotted"]),
  applicationCount: z.number(),
  totalSharesApplied: z.number(),
  totalSharesAllotted: z.number(),
});

export const allotmentGmpSchema = z
  .object({
    value: z.number().nullable(),
    estListingPrice: z.number().nullable(),
    estGainPct: z.number().nullable(),
    disclaimer: z.string().optional(),
  })
  .nullable();

/** Registrar answered. `found: false` means the PAN had no application. */
export const allotmentResultSchema = z.object({
  kind: z.literal("result"),
  ipo: z.object({
    slug: z.string(),
    name: z.string(),
    registrar: z.string(),
    allotmentStatus: z.string().optional(),
  }),
  pan: z.string(),
  found: z.boolean(),
  summary: allotmentSummarySchema.nullable(),
  applications: z.array(allotmentApplicationSchema),
  meta: z.object({
    checkedAt: z.string(),
    cached: z.boolean(),
    source: z.string().optional(),
  }),
  gmp: allotmentGmpSchema.optional(),
});

/**
 * Bigshare enforces a captcha server-side, so the backend returns 200 with
 * `supported: false` and a deep link. This is an answer, not a failure.
 */
export const allotmentDeepLinkSchema = z.object({
  kind: z.literal("deeplink"),
  ipo: z.object({ slug: z.string(), name: z.string(), registrar: z.string() }),
  supported: z.literal(false),
  reason: z.string(),
  deepLink: z.object({ label: z.string(), url: z.string() }),
  meta: z.object({ checkedAt: z.string(), cached: z.boolean() }),
});

export const allotmentResponseSchema = z.discriminatedUnion("kind", [
  allotmentResultSchema,
  allotmentDeepLinkSchema,
]);

export type AllotmentResponse = z.infer<typeof allotmentResponseSchema>;
export type AllotmentResult = z.infer<typeof allotmentResultSchema>;
export type AllotmentApplication = z.infer<typeof allotmentApplicationSchema>;

/* ------------------------------------------------------------------- errors */

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

/** Error codes the backend actually emits, mapped to what the user should do. */
export type KnownErrorCode =
  | "PAN_INVALID"
  | "PAN_REQUIRED"
  | "IPO_INVALID"
  | "IPO_REQUIRED"
  | "IPO_NOT_FOUND"
  | "RATE_LIMITED"
  | "DISTINCT_PAN_LIMIT"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "REGISTRAR_UNSUPPORTED"
  | "NETWORK"
  | "INTERNAL";

export class ApiError extends Error {
  code: KnownErrorCode;
  status: number;
  constructor(code: KnownErrorCode, message: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
