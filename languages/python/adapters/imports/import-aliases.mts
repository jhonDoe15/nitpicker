import type { AliasEntry, JsonNull, PythonModule } from '../analysis/typed/python-graph-types.mts';

function importedBase(entry: AliasEntry, importer: PythonModule): string | JsonNull {
  if (entry.name === undefined) {
    return entry.module;
  }
  const level = entry.level ?? 0;
  if (level === 0) {
    return `${String(entry.module)}.${entry.name}`;
  }
  const owner = importer.isPackage
    ? importer.module
    : importer.module.split('.').slice(0, -1).join('.');
  const parts = owner === '' ? [] : owner.split('.');
  const kept = parts.slice(0, Math.max(0, parts.length - (level - 1)));
  return [...kept, ...(entry.module ?? '').split('.'), entry.name].filter(Boolean).join('.');
}

function aliasOf(entry: AliasEntry, importer: PythonModule): [string, string | JsonNull] {
  if (entry.name === undefined) {
    const top = (entry.module ?? '').split('.')[0] ?? '';
    return typeof entry.asname === 'string' ? [entry.asname, entry.module] : [top, top];
  }
  return [entry.asname ?? entry.name, importedBase(entry, importer)];
}

export function aliases(
  imports: readonly AliasEntry[],
  importer: PythonModule,
): Map<string, string | JsonNull> {
  return new Map(imports.map((entry) => aliasOf(entry, importer)));
}
