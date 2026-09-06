import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Token proof sheet. Not part of the product — it exists so the token layer can
 * be reviewed in both themes before components are built on top of it.
 */

const SEMANTIC = [
  { name: "bg", v: "var(--bg)", note: "page ground" },
  { name: "surface", v: "var(--surface)", note: "cards, rows" },
  { name: "text", v: "var(--text)", note: "primary" },
  { name: "dim", v: "var(--dim)", note: "secondary, labels" },
  { name: "border", v: "var(--border)", note: "hairlines" },
  { name: "accent", v: "var(--accent)", note: "focus + active only" },
  { name: "positive", v: "var(--positive)", note: "allotted, gain" },
  { name: "negative", v: "var(--negative)", note: "loss" },
];

function Swatch({ name, v, note }: { name: string; v: string; note: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="size-11 shrink-0 rounded-control border"
        style={{ background: v, borderColor: "var(--border)" }}
      />
      <div className="min-w-0">
        <div className="num text-[13px]">{name}</div>
        <div className="text-[12px] text-dim">{note}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="mb-4 text-[13px] font-medium tracking-wide text-dim uppercase">{title}</h2>
      {children}
    </section>
  );
}

export default function TokensPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Token layer</h1>
          <p className="mt-1 text-sm text-dim">
            Primitive → semantic → component. Toggle the theme; every value below flips from the
            semantic layer alone.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Semantic colour">
          <div className="grid grid-cols-2 gap-4">
            {SEMANTIC.map((s) => (
              <Swatch key={s.name} {...s} />
            ))}
          </div>
        </Section>

        <Section title="Shape — only three exist">
          <div className="flex flex-wrap items-end gap-4">
            <div className="text-center">
              <div className="mb-2 size-20 rounded-card border border-border bg-bg" />
              <div className="num text-[12px]">card</div>
              <div className="text-[11px] text-dim">12px</div>
            </div>
            <div className="text-center">
              <div className="mb-2 size-20 rounded-control border border-border bg-bg" />
              <div className="num text-[12px]">control</div>
              <div className="text-[11px] text-dim">10px</div>
            </div>
            <div className="text-center">
              <div className="mb-2 h-9 w-24 rounded-pill border border-border bg-bg" />
              <div className="num text-[12px]">pill</div>
              <div className="text-[11px] text-dim">full</div>
            </div>
          </div>
          <p className="mt-4 text-[12px] text-dim">
            Tailwind&rsquo;s default radius scale is cleared in the theme, so{" "}
            <code className="num">rounded-lg</code> and friends do not resolve. The rule is enforced
            by the tooling, not by discipline.
          </p>
        </Section>

        <Section title="Numbers — Geist, tabular, medium">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[12px] text-dim">
                <th className="pb-2 font-medium">IPO</th>
                <th className="pb-2 text-right font-medium">GMP</th>
                <th className="pb-2 text-right font-medium">Est. gain</th>
              </tr>
            </thead>
            <tbody className="num">
              {[
                ["ESDS Software", "245", "+57.11%", true],
                ["Ashutosh Fibre", "33", "+35.87%", true],
                ["Veegaland", "18", "+12.86%", true],
                ["Amtech Esters", "0", "0.00%", null],
                ["Priority Jewels", "31", "-15.50%", false],
              ].map(([n, g, p, pos]) => (
                <tr key={n as string} className="border-t border-border">
                  <td className="py-1.5 font-sans">{n}</td>
                  <td className="py-1.5 text-right">₹{g}</td>
                  <td
                    className="py-1.5 text-right"
                    style={{
                      color:
                        pos === true
                          ? "var(--positive)"
                          : pos === false
                            ? "var(--negative)"
                            : "var(--dim)",
                    }}
                  >
                    {p}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] text-dim">Digits align vertically across rows.</p>
        </Section>

        <Section title="Motion">
          <ul className="space-y-2 text-[13px]">
            {[
              ["tab slide", "250ms", "cubic-bezier(.22,1,.36,1)"],
              ["accordion", "250ms", "grid-rows"],
              ["number pop-in", "500ms", "cubic-bezier(.34,1.45,.64,1)"],
              ["skeleton pulse", "1000ms", "bounded loop"],
              ["skeleton cross-fade", "400ms", "2px blur"],
              ["error shake", "280ms", "6px / 4px"],
              ["PAN row stagger", "260ms", "between results"],
            ].map(([k, d, e]) => (
              <li key={k} className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
                <span>{k}</span>
                <span className="num text-[12px] font-normal text-dim">
                  {d} · {e}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <div className="aw-skeleton h-9 w-28 rounded-control" />
            <span className="num text-2xl aw-pop-in" style={{ color: "var(--positive)" }}>
              34
            </span>
          </div>
        </Section>

        <Section title="Buttons + focus">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="h-9 rounded-control border px-4 text-sm"
              style={{
                background: "var(--btn-bg)",
                color: "var(--btn-text)",
                borderColor: "var(--btn-border)",
              }}
            >
              Check allotment
            </button>
            <span className="rounded-pill border border-border px-3 py-1 text-[12px] text-dim">
              mainboard
            </span>
            <span
              className="rounded-pill px-3 py-1 text-[12px]"
              style={{ background: "var(--positive-soft)", color: "var(--positive)" }}
            >
              Allotted
            </span>
          </div>
          <p className="mt-4 text-[12px] text-dim">
            Tab to the button: the focus ring is the only place the accent appears.
          </p>
        </Section>

        <Section title="Type scale">
          <div className="space-y-2">
            <div className="text-2xl font-semibold tracking-tight">Display 24 / semibold</div>
            <div className="text-lg font-medium">Heading 18 / medium</div>
            <div className="text-sm">Body 14 / regular</div>
            <div className="text-[13px] text-dim">Meta 13 / dim</div>
            <div className="num text-[13px]">Mono 13 / medium — 1234567890</div>
          </div>
        </Section>
      </div>
    </main>
  );
}
