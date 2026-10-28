// What #4471 holds once it is split: one problem per fix. causes.ts places a report by tenant and
// channel; a report the desk read as a one-day move (desk-notes.json) is a different bug wherever
// its tenant puts it, so it is taken out of its cause here, not footnoted under it.
import { causeOf, uniqueById, type Report, type Tenant } from '#lib/kb/causes';

export type Problem = 'parser' | 'hint' | 'shift';
export const PROBLEMS: readonly Problem[] = ['parser', 'hint', 'shift'];

export const WHAT: Record<Problem, string> = {
  parser: 'the shared parser reads every date month first: day and month swap',
  hint: 'booking-v3 prints MM/DD/YYYY under its date field: people type month first, the form reads day first',
  shift: 'the date moves by one day, not a swap: it differs by time zone',
};

export function problemOf(r: Report, t: Tenant | undefined, oneDayMove: readonly string[]): Problem | 'unplaced' {
  if (oneDayMove.includes(r.id)) return 'shift';
  return causeOf(r, t) ?? 'unplaced';
}

export type ProblemGroup = {
  problem: Problem | 'unplaced';
  ids: string[];
  tenants: number;
  firstSeen: string;
  lastSeen: string;
  // Intake's guess, wrong where it is not the problem's own name.
  mistagged: number;
};

export function splitTicket(
  reports: Report[],
  ticket: number,
  tenantOf: (r: Report) => Tenant | undefined,
  oneDayMove: readonly string[],
): { total: number; groups: ProblemGroup[] } {
  const merged = uniqueById(reports).filter((r) => r.mergedInto === ticket);
  const by = new Map<ProblemGroup['problem'], Report[]>();
  for (const r of merged) {
    const p = problemOf(r, tenantOf(r), oneDayMove);
    by.set(p, [...(by.get(p) ?? []), r]);
  }
  const groups = [...by.entries()]
    .map(([problem, rs]) => {
      const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
      return {
        problem,
        ids: rs.map((r) => r.id).sort(),
        tenants: new Set(rs.map((r) => r.tenant)).size,
        firstSeen: days[0],
        lastSeen: days[days.length - 1],
        mistagged: rs.filter((r) => r.meta.intakeTag !== problem).length,
      };
    })
    .sort((a, b) => b.ids.length - a.ids.length);
  return { total: merged.length, groups };
}
