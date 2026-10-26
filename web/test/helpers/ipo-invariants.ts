import { bucketOf } from "@/components/ipo-list";
import { stateLine } from "@/components/ipo-row";
import { issueSteps } from "@/components/awaiting-allotment";
import type { IpoListItem } from "@/lib/schemas";
import { allotmentPublished } from "@/lib/utils";

/**
 * Everything a row says about where an issue stands, checked against itself:
 * the tab it is filed under, the status line under its name, and the progress
 * strip in its expanded panel. Returns the problems found, empty when the
 * three agree.
 *
 * The step under way must match the tab, because they are two views of one
 * fact, and the steps must run done → under way → to come, because that is
 * the order time runs in.
 */
export function rowProblems(ipo: IpoListItem, now: Date): string[] {
  const problems: string[] = [];
  const tab = bucketOf(ipo, now);
  const line = stateLine(ipo, now);
  const published = allotmentPublished(ipo, now);

  // The strip is shown exactly when there is no result to check yet.
  if ((tab === "allotted") !== published) problems.push(`tab ${tab} but published=${published}`);

  const lineFits: Record<string, RegExp> = {
    allotted: /^(Allotment out|Listed)/,
    awaiting: /^(Closed — allotment pending|Allotment due today|Awaiting registrar results)$/,
    ongoing: /^(Closes|Open)/,
    upcoming: /^(Opens|Upcoming)/,
  };
  if (!lineFits[tab].test(line)) problems.push(`tab ${tab} but status line "${line}"`);

  if (tab !== "allotted") {
    const steps = issueSteps(ipo, now);
    const states = steps.map((s) => s.state);
    const nowAt = states.indexOf("now");
    if (states.filter((s) => s === "now").length !== 1) problems.push(`steps ${states.join(",")}: not exactly one under way`);
    if (states.slice(0, Math.max(nowAt, 0)).some((s) => s !== "done")) problems.push(`steps ${states.join(",")}: a step before the current one is not done`);
    if (states.slice(nowAt + 1).some((s) => s !== "next")) problems.push(`steps ${states.join(",")}: a step after the current one is done`);
    const expected = { upcoming: "Opens", ongoing: "Closes", awaiting: "Allotment" }[tab];
    if (steps[nowAt]?.label !== expected) problems.push(`tab ${tab} but the step under way is ${steps[nowAt]?.label}`);
    // Past tense only for what has happened.
    steps.forEach((s) => {
      if (/^(Opened|Closed)$/.test(s.label) !== (s.state === "done") && s.label !== "Allotment" && s.label !== "Listing") {
        problems.push(`step "${s.label}" is ${s.state}`);
      }
    });
  }
  return problems;
}
