export type FineEntry = {
  readonly memberId: string;
  readonly name: string;
  readonly cents: number;
};

type MemberTotal = {
  readonly memberId: string;
  readonly name: string;
  readonly totalCents: number;
};

function formatCents(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `$${String(dollars)}.${String(remainder).padStart(2, '0')}`;
}

function addEntry(totals: readonly MemberTotal[], entry: FineEntry): readonly MemberTotal[] {
  if (totals.some((total) => total.memberId === entry.memberId)) {
    return totals.map((total) =>
      total.memberId === entry.memberId
        ? { ...total, totalCents: total.totalCents + entry.cents }
        : total,
    );
  }
  return [...totals, { memberId: entry.memberId, name: entry.name, totalCents: entry.cents }];
}

function compareTotals(left: MemberTotal, right: MemberTotal): number {
  if (left.totalCents !== right.totalCents) {
    return right.totalCents - left.totalCents;
  }
  return left.name.localeCompare(right.name);
}

export function renderReport(asOf: string, entries: readonly FineEntry[]): readonly string[] {
  const header = `Overdue fines as of ${asOf}`;
  const totals: readonly MemberTotal[] = entries
    .reduce<readonly MemberTotal[]>(addEntry, [])
    .filter((total) => total.totalCents > 0);
  if (totals.length === 0) {
    return [header, 'No overdue fines'];
  }
  const ranked: readonly MemberTotal[] = totals.toSorted(compareTotals);
  return [header, ...ranked.map((total) => `${total.name}: ${formatCents(total.totalCents)}`)];
}
