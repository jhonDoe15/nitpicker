const CATEGORIES = ['exports', 'types', 'files'];

export function entriesOf(report) {
  return (report.issues ?? []).flatMap((issue) =>
    CATEGORIES.flatMap((category) =>
      (issue[category] ?? []).map((entry) => ({ file: issue.file, category, entry })),
    ),
  );
}

export function keyOf({ file, category, entry }) {
  return `${file}\0${category}\0${entry.name}`;
}
