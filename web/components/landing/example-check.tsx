import { CheckCircleIcon, MinusCircleIcon, XCircleIcon } from "@phosphor-icons/react/dist/ssr";

type Answer = "allotted" | "not" | "none";

const ROWS: { who: string; pan: string; answer: Answer; detail: string }[] = [
  { who: "You", pan: "ABCDE••••F", answer: "allotted", detail: "1 lot · 2,000 shares" },
  { who: "Papa", pan: "PQRSX••••K", answer: "not", detail: "Not allotted" },
  { who: "Didi", pan: "LMNOP••••Z", answer: "none", detail: "No application under this PAN" },
];

const LOOK: Record<Answer, { icon: typeof CheckCircleIcon; color: string }> = {
  allotted: { icon: CheckCircleIcon, color: "var(--positive)" },
  not: { icon: XCircleIcon, color: "var(--negative)" },
  none: { icon: MinusCircleIcon, color: "var(--dim)" },
};

/**
 * What one tap returns — the three answers a PAN can get, side by side. Sample
 * data, and labelled as such on the card itself: it illustrates the result
 * screen, it does not claim to be anyone's allotment.
 */
export function ExampleCheck() {
  return (
    <figure className="rounded-card border border-border bg-surface p-4 shadow-[0_24px_48px_-24px_rgba(21,21,26,0.25)]">
      <figcaption className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold">Check 3 PANs</span>
        <span className="rounded-pill border border-border px-2 py-0.5 text-[10px] font-medium tracking-wide text-dim uppercase">
          Example
        </span>
      </figcaption>
      <ul className="mt-3 space-y-2">
        {ROWS.map((r) => {
          const { icon: Icon, color } = LOOK[r.answer];
          return (
            <li key={r.who} className="flex items-center gap-3 rounded-control bg-chip px-3 py-2.5">
              <Icon size={18} weight="fill" style={{ color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium">{r.who}</span>
                  <span className="num text-[11px] text-dim">{r.pan}</span>
                </div>
                <div className="text-[12px]" style={{ color: r.answer === "none" ? "var(--dim)" : color }}>
                  {r.detail}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-[12px]">
        <span className="text-dim">At a ₹25 GMP, your lot is worth</span>
        <span className="num text-[15px] font-semibold" style={{ color: "var(--positive)" }}>
          +₹50,000
        </span>
      </div>
    </figure>
  );
}
