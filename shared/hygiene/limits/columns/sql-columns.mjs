import { blankComments, closingIndex, lineAt, splitTopLevel } from '../scanning/scan.mjs';

const OPEN = '[`"\\[]?';
const CLOSE = '[`"\\]]?';
const IDENT = `${OPEN}(\\w+)${CLOSE}`;
const TABLE_NAME = `(?:${OPEN}\\w+${CLOSE}\\.)?${OPEN}(\\w+)${CLOSE}`;
const TYPE_NAMES = String.raw`varchar2?|nvarchar2?|character\s+varying|char|nchar|character`;
const WIDTH_TYPE = String.raw`(?:national\s+)?(?:${TYPE_NAMES})\s*\(\s*(\d+)`;
const CREATE_TABLE = new RegExp(
  String.raw`create\s+(?:(?:global\s+)?temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?${TABLE_NAME}\s*\(`,
  'giu',
);
const COLUMN_DEFINITION = new RegExp(String.raw`^\s*${IDENT}\s(.*)$`, 'isu');
const WIDTH_ONLY = new RegExp(`^${WIDTH_TYPE}`, 'iu');
const ALTER = new RegExp(
  String.raw`alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?${TABLE_NAME}\s([^;]*)`,
  'giu',
);
const ADD_COLUMN = new RegExp(
  String.raw`\badd\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?${IDENT}\s([^,;]*)`,
  'giu',
);
const CHANGE_COLUMN = new RegExp(
  String.raw`\b(?:alter\s+(?:column\s+)?${IDENT}\s+(?:set\s+data\s+)?type|modify\s+(?:column\s+)?${IDENT})\s([^,;]*)`,
  'giu',
);
const NOT_A_COLUMN =
  /^(?:constraint|primary|foreign|unique|key|index|check|exclude|fulltext|spatial)\b/iu;
const NATURAL = new Intl.Collator('en', { numeric: true });

function widthOf(typeText) {
  const width = WIDTH_ONLY.exec(typeText.trim())?.[1];
  return width === undefined ? undefined : Number(width);
}

function createdColumns(text) {
  return [...text.matchAll(CREATE_TABLE)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const body = text.slice(open + 1, closingIndex(text, open));
    return splitTopLevel(body).flatMap(({ text: item, offset }) => {
      const column = COLUMN_DEFINITION.exec(item);
      return column === null || NOT_A_COLUMN.test(item.trim())
        ? []
        : [
            {
              table: match[1],
              column: column[1],
              width: widthOf(column[2]),
              at: open + 1 + offset,
            },
          ];
    });
  });
}

function alteredColumns(text) {
  return [...text.matchAll(ALTER)].flatMap((match) => {
    const body = match[2];
    const start = match.index + match[0].indexOf(body);
    const added = [...body.matchAll(ADD_COLUMN)].map((add) => ({
      column: add[1],
      width: widthOf(add[2]),
      at: start + add.index,
    }));
    const changed = [...body.matchAll(CHANGE_COLUMN)].map((change) => ({
      column: change[1] ?? change[2],
      width: widthOf(change[3]),
      at: start + change.index,
    }));
    return [...added, ...changed].map((entry) => ({ table: match[1], ...entry }));
  });
}

function columnsOf(text) {
  return [...createdColumns(text), ...alteredColumns(text)].sort(
    (left, right) => left.at - right.at,
  );
}

export function sqlColumnDeclarations(files, readText) {
  return files.flatMap((file) => {
    const text = readText(file);
    return text === undefined
      ? []
      : columnsOf(
          blankComments(text.replaceAll(/--[^\n]*/gu, (match) => ' '.repeat(match.length))),
        ).map((entry) => ({ ...entry, file, line: lineAt(text, entry.at) }));
  });
}

export function naturalOrder(files) {
  return [...files].sort((left, right) => NATURAL.compare(left, right));
}
