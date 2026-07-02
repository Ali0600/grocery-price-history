/** ISO-8601 week label ("2026-W28") for a date; weeks run Mon–Sun, week 1 is
 * the week containing the first Thursday of the year. Computed in UTC so the
 * label doesn't depend on the runner's timezone. */
export function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The week a snapshot belongs to: the modal ISO week of the offers'
 * valid_from dates (deals are Mon–Sat, and the Sunday collect run sees next
 * week's flyers — labelling by validity files them under the week they are
 * live, not the week they were fetched). Falls back to `now`'s week when no
 * offer carries a validity date. */
export function snapshotWeek(validFroms: (string | null)[], now: Date): string {
  const counts = new Map<string, number>();
  for (const v of validFroms) {
    if (!v) continue;
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const label = isoWeekLabel(d);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best ?? isoWeekLabel(now);
}
