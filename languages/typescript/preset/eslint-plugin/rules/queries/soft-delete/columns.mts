import { wordsOf } from '../../../../../../../shared/naming/secret-words.mjs';

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

export function isColumn(name) {
  return typeof name === 'string' && COLUMN.test(name);
}

export function isHelperName(name) {
  return (
    typeof name === 'string' &&
    !COLUMN.test(name) &&
    !ACKNOWLEDGED.has(name) &&
    wordsOf(name).some((word) => HELPER_WORDS.has(word))
  );
}

export function isAcknowledgement(name) {
  return ACKNOWLEDGED.has(name);
}

export function columnKey(name) {
  return name.toLowerCase().replaceAll('_', '');
}

export function filterEntry(table, guard) {
  return guard.helper === undefined
    ? `${table}${SEPARATOR}${guard.column}`
    : `${table}${SEPARATOR}${HELPER_PART}${SEPARATOR}${guard.helper}`;
}

export function filtersByTable(entries = []) {
  const tables = new Map();
  for (const entry of entries) {
    const [table, ...rest] = entry.split(SEPARATOR);
    const isHelper = rest[0] === HELPER_PART && rest.length > 1;
    const found = tables.get(table) ?? { columns: new Map(), helpers: new Set() };
    if (isHelper) {
      found.helpers.add(rest.slice(1).join(SEPARATOR));
    } else if (rest.length > 0) {
      found.columns.set(columnKey(rest.join(SEPARATOR)), rest.join(SEPARATOR));
    }
    tables.set(table, found);
  }
  return tables;
}
