import { isUnder } from '../policy-scope.mjs';

const LISTED_FILES = 3;
const NOTHING_NEW = 'covers no checked file it did not cover before';

function listed(files, limit) {
  const more = files.length > limit ? `, and ${files.length - limit} more` : '';
  return `${files.slice(0, limit).join(', ')}${more}`;
}

function within(entry, file) {
  if (entry.roots === undefined) {
    return true;
  }
  const contains = entry.contains ?? isUnder;
  return entry.roots.some((root) => contains(file, root));
}

function lostText(base, lost, limit) {
  return `${base.label} no longer includes checked code: ${listed(lost, limit)}`;
}

function familyOf(entry) {
  return entry.key.split(':')[0];
}

function rootsChange(base, head, { scope, headEntries }) {
  const family = headEntries.filter(
    (entry) => entry.type === 'roots' && familyOf(entry) === familyOf(base),
  );
  const applies = head?.applies ?? base.applies ?? (() => true);
  const lost = scope.keptCode.filter(
    (file) => applies(file) && within(base, file) && !family.some((entry) => within(entry, file)),
  );
  if (lost.length === 0) {
    return { loosened: [], changed: [] };
  }
  const file = (head ?? base).file;
  return {
    loosened: [
      {
        text: lostText(base, lost, LISTED_FILES),
        key: lostText(base, lost, lost.length),
        files: [file, ...lost],
      },
    ],
    changed: [],
  };
}

function excludesChange(base, head, scope) {
  const before = base?.patterns ?? [];
  const added = head.patterns.filter((pattern) => !before.includes(pattern));
  const outcomes = added.map((pattern) => {
    const covered = scope.keptCode.filter(
      (file) => head.covers(file, pattern) && !before.some((known) => base.covers(file, known)),
    );
    return { pattern, covered };
  });
  return {
    loosened: outcomes
      .filter(({ covered }) => covered.length > 0)
      .map(({ pattern, covered }) => ({
        text: `${head.label} added: ${pattern}`,
        files: [head.file, ...covered],
      })),
    changed: [
      ...outcomes
        .filter(({ covered }) => covered.length === 0)
        .map(({ pattern }) => `${head.label} added: ${pattern} (${NOTHING_NEW})`),
      ...before
        .filter((pattern) => !head.patterns.includes(pattern))
        .map((pattern) => `${head.label} removed: ${pattern}`),
    ],
  };
}

function entryChange({ base, head, headEntries, scope }) {
  if (base?.type === 'roots') {
    return rootsChange(base, head, { scope, headEntries });
  }
  if (head?.type === 'excludes') {
    return excludesChange(base, head, scope);
  }
  const removed = base?.type === 'excludes' ? base.patterns : [];
  return { loosened: [], changed: removed.map((pattern) => `${base.label} removed: ${pattern}`) };
}

export function buildNarrowingChanges(scope) {
  const { base = [], head = [] } = scope.buildSources ?? {};
  const baseByKey = new Map(base.map((entry) => [entry.key, entry]));
  const headByKey = new Map(head.map((entry) => [entry.key, entry]));
  const keys = new Set([...baseByKey.keys(), ...headByKey.keys()]);
  return [...keys].map((key) =>
    entryChange({ base: baseByKey.get(key), head: headByKey.get(key), headEntries: head, scope }),
  );
}
