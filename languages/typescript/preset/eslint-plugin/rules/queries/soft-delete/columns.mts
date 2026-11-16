import { wordsOf as untypedWordsOf } from '../../../../../../../shared/naming/secret-words.mjs';

const wordsOf: (name: string) => string[] = untypedWordsOf;

export type TableFilter = { columns: Map<string, string>; helpers: Set<string> };
type Guard = { readonly column?: string | undefined; readonly helper?: string | undefined };

const COLUMN_NAMES =
  'deleted_?at|is_?deleted|deleted|archived(?:_?at)?|is_?archived|visibility|is_?visible|hidden|is_?hidden';
const COLUMN = new RegExp(`^(?:${COLUMN_NAMES})$`, 'iu');
export const COLUMN_IN_TEXT = new RegExp(
  `(?:["'\`]?([a-z_]\\w*)["'\`]?\\.)?["'\`]?\\b(${COLUMN_NAMES})\\b["'\`]?(\\s*(?:is\\b|in\\b|not\\b|[=<>!]))?`,
  'giu',
);
const HELPER_WORDS = new Set([
  'deleted',
  'undeleted',
  'visible',
  'visibility',
  'active',
  'archived',
  'trashed',
  'alive',
  'live',
]);
const ACKNOWLEDGED = new Set([
  'withDeleted',
  'onlyDeleted',
  'includeDeleted',
  'withTrashed',
  'onlyTrashed',
  'unscoped',
]);
const SEPARATOR = '__';
const HELPER_PART = 'helper';

export function isColumn(name: string | undefined): boolean {
  return name !== undefined && COLUMN.test(name);
}

export function isHelperName(name: string | undefined): boolean {
  return (
    name !== undefined &&
    !COLUMN.test(name) &&
    !ACKNOWLEDGED.has(name) &&
    wordsOf(name).some((word) => HELPER_WORDS.has(word))
  );
}

export function isAcknowledgement(name: string | undefined): boolean {
  return name !== undefined && ACKNOWLEDGED.has(name);
}

export function columnKey(name: string): string {
  return name.toLowerCase().replaceAll('_', '');
}

export function filterEntry(table: string, guard: Guard): string {
  return guard.helper === undefined
    ? `${table}${SEPARATOR}${String(guard.column)}`
    : `${table}${SEPARATOR}${HELPER_PART}${SEPARATOR}${guard.helper}`;
}

export function filtersByTable(entries: readonly string[] = []): Map<string, TableFilter> {
  const tables = new Map<string, TableFilter>();
  for (const entry of entries) {
    const [table = '', ...rest] = entry.split(SEPARATOR);
    const isHelper = rest[0] === HELPER_PART && rest.length > 1;
    const found: TableFilter = tables.get(table) ?? { columns: new Map(), helpers: new Set() };
    if (isHelper) {
      found.helpers.add(rest.slice(1).join(SEPARATOR));
    } else if (rest.length > 0) {
      found.columns.set(columnKey(rest.join(SEPARATOR)), rest.join(SEPARATOR));
    }
    tables.set(table, found);
  }
  return tables;
}
