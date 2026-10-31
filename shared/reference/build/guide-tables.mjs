import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url);
const TABLE_ROW = /^\|(.*)\|\s*$/u;
const DIVIDER = /^\|[\s|:-]+\|\s*$/u;
const CELL_SPLIT = /(?<!\\)\|/u;
const CODE_ID = /`([^`]+)`/gu;
const RELATIVE_LINK = /\]\((?![a-z]+:\/\/)([^)#\s]*)(#[^)\s]*)?\)/gu;

function cellsOf(line) {
  return TABLE_ROW.exec(line)[1]
    .split(CELL_SPLIT)
    .map((cell) => cell.trim().replaceAll('\\|', '|'));
}

function withRepositoryLinks(text, guide) {
  return text.replaceAll(RELATIVE_LINK, (_, target, anchor = '') => {
    const file = target === '' ? guide : path.posix.join(path.posix.dirname(guide), target);
    return `](${file}${anchor})`;
  });
}

function rowsOf(guide) {
  const lines = readFileSync(new URL(guide, REPOSITORY_ROOT), 'utf8').split('\n');
  return lines.flatMap((line, index) => {
    if (!TABLE_ROW.test(line) || DIVIDER.test(line) || !DIVIDER.test(lines[index + 1] ?? '')) {
      return [];
    }
    const headers = cellsOf(line).map((header) => header.toLowerCase());
    const body = lines.slice(index + 2);
    const end = body.findIndex((row) => !TABLE_ROW.test(row));
    return (end === -1 ? body : body.slice(0, end)).map((row) =>
      Object.fromEntries(
        cellsOf(row).map((cell, column) => [headers[column], withRepositoryLinks(cell, guide)]),
      ),
    );
  });
}

function readGuideTables(guide) {
  const byId = new Map();
  for (const row of rowsOf(guide)) {
    const first = Object.values(row)[0];
    for (const [, id] of first.matchAll(CODE_ID)) {
      byId.set(id, [...(byId.get(id) ?? []), row]);
    }
  }
  return byId;
}

/**
 * The cell under `header` (lowercase) of the table row that names `id` in its first column, in a
 * guide of this repository, with the guide's relative links made relative to the repository root,
 * or undefined when no such row exists.
 */
export function optionalGuideCell(guide, id, header) {
  return (readGuideTables(guide).get(id) ?? [])
    .map((row) => row[header])
    .find((text) => text !== undefined);
}

/** `optionalGuideCell`, for a row the guide must have: it throws when the row is missing. */
export function guideCell(guide, id, header) {
  const cell = optionalGuideCell(guide, id, header);
  if (cell === undefined) {
    throw new Error(`${guide} has no table row for ${id} with a "${header}" column`);
  }
  return cell;
}
