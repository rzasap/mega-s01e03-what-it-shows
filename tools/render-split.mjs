// Renders src/routes/kb/incidents/4471-split/+page.svx the way the kb's runbook layout shows it.
// Reimplements causes.ts, problems.ts and desk-ref.ts; reads only data files from the kb.
// usage: node render-split.mjs <kb root> <out.html>
import fs from 'node:fs';
import path from 'node:path';

const [root, out] = process.argv.slice(2);
const data = (p) => JSON.parse(fs.readFileSync(path.join(root, 'src/lib/data', p), 'utf8'));
const reports = data('reports-4471.json');
const notes = data('desk-notes.json');
const tenants = new Map(
  fs.readdirSync(path.join(root, 'src/lib/data/tenants')).map((f) => {
    const t = data('tenants/' + f);
    return [t.handle, t];
  }),
);

const HINT = { 'booking-v2': 'DD/MM/YYYY', 'booking-v3': 'MM/DD/YYYY' };
const dayFirst = (locale) => {
  const o = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.UTC(2026, 0, 2, 12)))
    .map((p) => p.type);
  return o.indexOf('day') < o.indexOf('month');
};
const causeOf = (r, t) => (!t || !dayFirst(t.locale) ? null : r.channel === 'form' && HINT[t.form].startsWith('MM') ? 'hint' : 'parser');
const problemOf = (r) => causeOf(r, tenants.get(r.tenant)) ?? 'unplaced';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const fnv1a = (s, seed) => {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};
const deskRef = (sig) => {
  const t = sig.trim();
  let bits = (BigInt(fnv1a(t, 0x811c9dc5)) << 8n) | BigInt(fnv1a(t, 0x9e3779b9) & 0xff);
  let o = '';
  for (let i = 0; i < 8; i++) {
    o = ALPHABET[Number(bits & 31n)] + o;
    bits >>= 5n;
  }
  return `DR-${o.slice(0, 4)}-${o.slice(4)}`;
};

const WHAT = {
  parser: 'the shared parser reads every date month first: day and month swap',
  hint: 'booking-v3 prints MM/DD/YYYY under its date field: people type month first, the form reads day first',
  shift: 'the date moves by one day, not a swap: it differs by time zone',
};
const REPO = 'https://github.com/rzasap/mega-s01e03-what-it-shows/issues';
const issues = { parser: `${REPO}/1`, hint: `${REPO}/2`, shift: `${REPO}/3` };

const merged = [...new Map(reports.map((r) => [r.id, r])).values()].filter((r) => r.mergedInto === 4471);
const by = new Map();
for (const r of merged) by.set(problemOf(r), [...(by.get(problemOf(r)) ?? []), r]);
const groups = [...by.entries()]
  .map(([problem, rs]) => {
    const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
    return {
      problem,
      n: rs.length,
      tenants: new Set(rs.map((r) => r.tenant)).size,
      first: days[0],
      last: days.at(-1),
      alsoShift: rs.filter((r) => notes.oneDayMove.includes(r.id)).length,
    };
  })
  .sort((a, b) => b.n - a.n);
{
  const rs = merged.filter((r) => notes.oneDayMove.includes(r.id));
  const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
  if (rs.length) groups.push({ problem: 'shift', n: rs.length, tenants: new Set(rs.map((r) => r.tenant)).size, first: days[0], last: days.at(-1), alsoShift: 0 });
}
const footnotes = groups
  .filter((g) => g.alsoShift)
  .map((g) => `    <p class="note">${g.alsoShift} of the <code>${g.problem}</code> reports read as a one-day move: counted under <code>${g.problem}</code> by tenant, and under <code>shift</code>.</p>`)
  .join('\n');

const reviewed = '2026-10-28';
const age = Math.floor((Date.parse('2026-10-28T12:00:00Z') - Date.parse(reviewed)) / 86_400_000);
const rows = groups
  .map(
    (g) => `      <tr>
        <td><code>${g.problem}</code><br /><span class="what">${WHAT[g.problem] ?? 'no cause on file'}</span></td>
        <td>${g.n}</td><td>${g.tenants}</td><td>${g.first} → ${g.last}</td>
        <td>${issues[g.problem] ? `<a href="${issues[g.problem]}">${issues[g.problem].replace('https://github.com/', '').replace('/issues/', '#')}</a>` : 'none yet'}</td>
      </tr>`,
  )
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>#4471 split · three date bugs, not one · support kb</title>
<style>
  :root { --bg: #fbfaf7; --fg: #1d1d1b; --muted: #6b6a66; --line: #e3e0d8; --accent: #2f6f5e; --warn: #b4501f; --warn-bg: #fbeee6; --note-bg: #eef5f2; --mono: ui-monospace, 'Cascadia Code', Menlo, monospace; }
  @media (prefers-color-scheme: dark) { :root { --bg: #171716; --fg: #ecebe6; --muted: #9c9a93; --line: #34332f; --accent: #6fbfa6; --warn: #f0905d; --warn-bg: #3a2418; --note-bg: #1d2c27; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, sans-serif; }
  .kb { max-width: 760px; margin: 0 auto; padding: 2rem 16px 4rem; }
  .kb table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.92rem; }
  .kb th, .kb td { border-bottom: 1px solid var(--line); padding: 0.35rem 0.5rem; text-align: left; vertical-align: top; }
  .kb code { font-family: var(--mono); font-size: 0.88em; }
  .kb a { color: var(--accent); }
  .crumb { font: 0.8rem var(--mono); text-decoration: none; color: var(--muted); }
  h1 { margin: 0.25rem 0 0.5rem; line-height: 1.2; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; color: var(--muted); font-size: 0.85rem; margin: 0; }
  .status { border: 1px solid var(--line); border-radius: 99px; padding: 0 0.6rem; }
  footer { margin-top: 3rem; color: var(--muted); font-size: 0.8rem; border-top: 1px solid var(--line); padding-top: 1rem; }
  aside { border-left: 4px solid var(--accent); padding: 0.5rem 1rem; margin: 1rem 0; background: var(--note-bg); }
  aside.warn { border-color: var(--warn); background: var(--warn-bg); }
  .sum { font-size: 1.1rem; }
  .what { color: var(--muted); font-size: 0.85em; }
  .note { color: var(--muted); font-size: 0.85em; }
  .stamp { margin: 2rem 0 0; font: 0.85rem var(--mono); color: var(--muted); }
  .stamp b { color: var(--accent); letter-spacing: 0.04em; }
</style>
</head>
<body>
<div class="kb">
  <header>
    <a class="crumb" href="/kb">support desk · kb</a>
    <h1>#4471 split · three date bugs, not one</h1>
    <p class="meta"><span>owner <b>rzasap</b></span><span class="status open">open</span><span>reviewed ${reviewed} · ${age} days ago</span></p>
  </header>
  <main>
    <p><a href="/kb/incidents/4471">#4471</a> was merged on subject line (<a href="/kb/decisions/0001-dedupe-by-subject">decision 0001</a>)
    and marked known: one parser bug, one fix queued. Read by tenant, channel and body, the same
    reports hold three problems. The queued parser fix closes only the first. Each now has a ticket of
    its own.</p>
    <aside class="warn"><p>Not one issue. Ship the parser fix and booking-v3 form reports keep coming, and so do one-day moves.</p></aside>
    <h2>What #4471 holds</h2>
    <p class="sum"><strong>${merged.length}</strong> reports merged into #4471 · <strong>${groups.length}</strong> problems</p>
    <table>
      <thead><tr><th>problem</th><th>reports</th><th>tenants</th><th>seen</th><th>ticket</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
${footnotes}
    <h2>How to tell them apart</h2>
    <ul>
      <li><strong><code>parser</code></strong>: day and month swap (7 April → 4 July). Any day-first tenant, any channel except a
      booking-v3 form. Fix: the parser reads dates in the tenant's locale.</li>
      <li><strong><code>hint</code></strong>: the same swap, but only through the booking form of a booking-v3 tenant. The form
      prints <code>MM/DD/YYYY</code> under its date field; people type what it says; the form reads it the
      tenant's way. The parser fix does not reach it. Fix: the hint shows the order the form reads.</li>
      <li><strong><code>shift</code></strong>: not a swap. The date is one day off, and two people in one meeting see different
      days (Lisbon Tuesday, Toronto Monday); an invite can arrive “before” its booking. A time-zone bug.
      Fix: send dates with their time zone, not as a bare day.</li>
    </ul>
    <p>Intake's tag is a guess from the reporter's browser. Place a report by its tenant
    (<code>src/lib/data/tenants</code>) and its channel, never by the tag. Counts are the desk's own view
    (<code>causes.ts</code>): a one-day move stays counted where its tenant files it.</p>
    <h2>For the desk</h2>
    <ul>
      <li>Reports in #4471 that match subject but not problem are not duplicates. Re-file by problem.</li>
      <li>The export lists some reports twice (overlapping pages). Count by report id.</li>
    </ul>
    <p class="stamp">desk ref <b>${deskRef('rzasap')}</b></p>
  </main>
  <footer>Pages are written by people. Tables and charts are built from data at render time.</footer>
</div>
</body>
</html>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(JSON.stringify({ total: merged.length, groups, deskRef: deskRef('rzasap') }));
