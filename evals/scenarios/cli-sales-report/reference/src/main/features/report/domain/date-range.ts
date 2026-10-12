export type DateRange = { readonly from?: string | undefined; readonly to?: string | undefined };

export function isOrdered(range: DateRange): boolean {
  return range.from === undefined || range.to === undefined || range.from <= range.to;
}

export function contains(range: DateRange, date: string): boolean {
  return (
    (range.from === undefined || date >= range.from) && (range.to === undefined || date <= range.to)
  );
}
