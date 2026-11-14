import type { KnipCategory, KnipItem, KnipReport } from './typed/knip-types.mts';

const CATEGORIES: readonly KnipCategory[] = ['exports', 'types', 'files'];

export function entriesOf(report: KnipReport): KnipItem[] {
  return (report.issues ?? []).flatMap((issue) =>
    CATEGORIES.flatMap((category) =>
      (issue[category] ?? []).map((entry) => ({ file: issue.file, category, entry })),
    ),
  );
}

export function keyOf({ file, category, entry }: KnipItem): string {
  return `${file}\0${category}\0${entry.name}`;
}
