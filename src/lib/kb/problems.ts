// What #4471 holds once it is split: one problem per fix, counted the desk's way. causes.ts places
// every report by tenant and channel; a report the desk read as a one-day move (desk-notes.json)
// stays counted where its tenant files it, and also counts toward `shift`, its own problem.
import { groupByCause, readAs, uniqueById, type Report, type Tenant } from '#lib/kb/causes';

export type Problem = 'parser' | 'hint' | 'shift';
export const PROBLEMS: readonly Problem[] = ['parser', 'hint', 'shift'];

export const WHAT: Record<Problem, string> = {
  parser: 'the shared parser reads every date month first: day and month swap',
  hint: 'booking-v3 prints MM/DD/YYYY under its date field: people type month first, the form reads day first',
  shift: 'the date moves by one day, not a swap: it differs by time zone',
};

export type ProblemGroup = {
  problem: Problem | 'unplaced';
  ids: string[];
  tenants: number;
  firstSeen: string;
  lastSeen: string;
  // Of these, how many the desk also reads as a one-day move.
  alsoShift: number;
};

function summary(problem: ProblemGroup['problem'], rs: Report[], alsoShift = 0): ProblemGroup {
  const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
  return {
    problem,
    ids: rs.map((r) => r.id).sort(),
    tenants: new Set(rs.map((r) => r.tenant)).size,
    firstSeen: days[0],
    lastSeen: days[days.length - 1],
    alsoShift,
  };
}

export function splitTicket(
  reports: Report[],
  ticket: number,
  tenantOf: (r: Report) => Tenant | undefined,
  oneDayMove: readonly string[],
): { total: number; groups: ProblemGroup[] } {
  const merged = uniqueById(reports).filter((r) => r.mergedInto === ticket);
  const groups = groupByCause(merged, tenantOf).map((g) => summary(g.cause, g.reports, readAs(g, oneDayMove)));
  const shift = merged.filter((r) => oneDayMove.includes(r.id));
  return { total: merged.length, groups: shift.length ? [...groups, summary('shift', shift)] : groups };
}
