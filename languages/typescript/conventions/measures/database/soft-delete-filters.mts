import {
  columnKey,
  filterEntry,
} from '../../../preset/eslint-plugin/rules/queries/soft-delete/columns.mts';
import { automaticTables } from './automatic-filters.mts';
import { readEvidence } from './read-evidence.mts';

const MIN_READS = 5;
const MIN_SHARE = 0.8;
const KEY = /^(read|guard|auto):([^:#]+)(?::(col|fn):([^#]+))?#\d+$/u;

export const SOFT_DELETE_FILTERS_CONVENTION = {
  id: 'typescript.softDeleteFilters',
  label: 'Soft-delete and visibility filters',
  kind: 'names',
  namesMeaning:
    'the tables whose reads mostly apply a soft-delete or visibility filter, one entry per table: <table>__<column> or <table>__helper__<name>',
  minUnit: 'reads',
  fallback: [],
  minFiles: MIN_READS,
  files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
  scope: 'source',
  sampleLimit: 2000,
  measure: filterEvidence,
  choose: followedFilters,
};

export function softDeleteFilterEntries(conventions = {}) {
  return conventions[SOFT_DELETE_FILTERS_CONVENTION.id] ?? [];
}

function filterEvidence(text, file) {
  return [...readEvidence(text, file), ...automaticTables(text)];
}

function addGuard(guards, { table, identity, name }, count) {
  const byIdentity = guards.get(table) ?? new Map();
  const forms = byIdentity.get(identity) ?? { total: 0, spellings: new Map() };
  forms.total += count;
  forms.spellings.set(name, (forms.spellings.get(name) ?? 0) + count);
  byIdentity.set(identity, forms);
  guards.set(table, byIdentity);
}

function tally(counts) {
  const reads = new Map();
  const guards = new Map();
  const automatic = new Set();
  for (const [key, count] of Object.entries(counts)) {
    const [, kind, table, type, name] = KEY.exec(key) ?? [];
    if (kind === 'auto') {
      automatic.add(table);
    } else if (kind === 'read') {
      reads.set(table, (reads.get(table) ?? 0) + count);
    } else if (kind !== undefined) {
      const identity = type === 'col' ? `col:${columnKey(name)}` : `fn:${name}`;
      addGuard(guards, { table, identity, name }, count);
    }
  }
  return { reads, guards, automatic };
}

function followedFilters(counts) {
  const { reads, guards, automatic } = tally(counts);
  return [...guards]
    .filter(([table]) => !(automatic.has('all') || automatic.has(table)))
    .flatMap(([table, byIdentity]) =>
      [...byIdentity]
        .filter(
          ([, forms]) =>
            reads.get(table) >= MIN_READS && forms.total / reads.get(table) >= MIN_SHARE,
        )
        .map(([identity, forms]) => {
          const [spelling] = [...forms.spellings].reduce((best, entry) =>
            entry[1] > best[1] ? entry : best,
          );
          return filterEntry(
            table,
            identity.startsWith('col:') ? { column: spelling } : { helper: spelling },
          );
        }),
    );
}
