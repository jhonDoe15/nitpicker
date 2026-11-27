import { globPath, type GlobPath } from './glob-test.mts';
import {
  compiledEntry,
  defaultEntries,
  EXTERNAL,
  ignored,
  pathMatches,
  type Entry,
  type Pattern,
} from './config-match.mts';

type ConfigKey = (relativeFile: string) => string | undefined;
type EntryMatch = 'none' | 'universal' | 'specific';

const NONE: EntryMatch = 'none';
const UNIVERSAL: EntryMatch = 'universal';
const SPECIFIC: EntryMatch = 'specific';

function globallyIgnored(globalIgnores: readonly Entry[], relativePath: GlobPath) {
  return globalIgnores.reduce(
    (isIgnored, entry) => ignored(entry.ignores ?? [], relativePath, isIgnored),
    false,
  );
}

function directoryIgnored(globalIgnores: readonly Entry[], cache: Map<string, boolean>) {
  return (relativeDirectory: string) => {
    if (relativeDirectory === '' || relativeDirectory === '.') {
      return false;
    }
    let checked = '';
    for (const part of relativeDirectory.split('/')) {
      checked += `${part}/`;
      const known = cache.get(checked) ?? globallyIgnored(globalIgnores, globPath(checked));
      cache.set(checked, known);
      if (known) {
        return true;
      }
    }
    return false;
  };
}

function entryMatch(entry: Entry, relativeFile: GlobPath): EntryMatch {
  if (entry.files === undefined) {
    if (entry.ignores === undefined) {
      return UNIVERSAL;
    }
    return entry.globalIgnore || ignored(entry.ignores, relativeFile, false) ? NONE : UNIVERSAL;
  }
  const { specific, universal } = entry;
  if (universal.length === 0) {
    return pathMatches(entry.files, entry.ignores, relativeFile) ? SPECIFIC : NONE;
  }
  if (specific.length > 0 && pathMatches(specific, entry.ignores, relativeFile)) {
    return SPECIFIC;
  }
  return pathMatches(universal, entry.ignores, relativeFile) ? UNIVERSAL : NONE;
}

function keyOf(entries: readonly Entry[], relativeFile: GlobPath): string | undefined {
  const indices: number[] = [];
  let found = false;
  for (const [index, entry] of entries.entries()) {
    const match = entryMatch(entry, relativeFile);
    if (match !== NONE) {
      indices.push(index);
      found ||= match === SPECIFIC;
    }
  }
  return found ? indices.join(',') : undefined;
}

export function configKeyOf(policyEntries: readonly unknown[]): ConfigKey | undefined {
  const cache = new Map<string, Pattern>();
  const compiled = [...defaultEntries, ...policyEntries].map((entry) =>
    compiledEntry(entry, cache),
  );
  if (!compiled.every((entry) => entry !== undefined)) {
    return undefined;
  }
  const globalIgnores = compiled.filter((entry) => entry.globalIgnore);
  const isDirectoryIgnored = directoryIgnored(globalIgnores, new Map());
  return (relativeFile) => {
    const file = globPath(relativeFile);
    const slash = relativeFile.lastIndexOf('/');
    if (
      EXTERNAL.test(relativeFile) ||
      isDirectoryIgnored(slash === -1 ? '' : relativeFile.slice(0, slash)) ||
      globallyIgnored(globalIgnores, file)
    ) {
      return undefined;
    }
    return keyOf(compiled, file);
  };
}
