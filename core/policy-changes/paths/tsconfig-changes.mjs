export function tsconfigChanges(scope) {
  if (scope.tsconfigs === undefined) {
    return { loosened: [], changed: [] };
  }
  const { base, head } = scope.tsconfigs;
  const kept = [...head.keys()].filter((file) => base.has(scope.basePathOf(file)));
  const keptBase = new Set(kept.map((file) => scope.basePathOf(file)));
  const removed = [...base.keys()]
    .filter((file) => !keptBase.has(file))
    .map((file) => ({
      text: `tsconfig removed: ${file}`,
      kind: 'tsconfig-removed',
      files: [file],
    }));
  const toggled = kept
    .filter((file) => base.get(scope.basePathOf(file)) !== head.get(file))
    .map((file) => ({
      text: `${file} checkJs: ${String(base.get(scope.basePathOf(file)))} -> ${String(head.get(file))}`,
      kind: 'check-js-off',
      files: [file],
      loosens: head.get(file) === false,
    }));
  return {
    loosened: [
      ...removed,
      ...toggled
        .filter(({ loosens }) => loosens)
        .map(({ text, kind, files }) => ({ text, kind, files })),
    ],
    changed: toggled.filter(({ loosens }) => !loosens).map(({ text }) => text),
  };
}
