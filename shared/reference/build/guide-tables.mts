import path from 'node:path';
import { guidePages, guideText } from './guide-pages.mts';

const TABLE_ROW = /^\|(.*)\|\s*$/u;
const DIVIDER = /^\|[\s|:-]+\|\s*$/u;
const CELL_SPLIT = /(?<!\\)\|/u;
const CODE_ID = /`([^`]+)`/gu;
const RELATIVE_LINK = /\]\((?![a-z]+:\/\/)([^)#\s]*)(#[^)\s]*)?\)/gu;

function cellsOf(line: string): string[] {
  return (TABLE_ROW.exec(line)?.[1] ?? '')
    .split(CELL_SPLIT)
    .map((cell) => cell.trim().replaceAll('\\|', '|'));
}

function withRepositoryLinks(text: string, guide: string): string {
  return text.replaceAll(
    RELATIVE_LINK,
    (_: string, target: string, anchor: string | undefined = '') => {
      const file = target === '' ? guide : path.posix.join(path.posix.dirname(guide), target);
      return `](${file}${anchor})`;
    },
  );
}

function rowsOf(guide: string): Record<string, string>[] {
  return guidePages(guide).flatMap(pageRows);
}

function pageRows(guide: string): Record<string, string>[] {
  const lines = guideText(guide).split('\n');
  return lines.flatMap((line, index) => {
    if (!TABLE_ROW.test(line) || DIVIDER.test(line) || !DIVIDER.test(lines[index + 1] ?? '')) {
      return [];
    }
    const headers = cellsOf(line).map((header) => header.toLowerCase());
    const body = lines.slice(index + 2);
    const end = body.findIndex((row) => !TABLE_ROW.test(row));
    return (end === -1 ? body : body.slice(0, end)).map((row) =>
      Object.fromEntries(
        cellsOf(row).map((cell, column) => [
          String(headers[column]),
          withRepositoryLinks(cell, guide),
        ]),
      ),
    );
  });
}

function readGuideTables(guide: string): Map<string, Record<string, string>[]> {
  const byId = new Map<string, Record<string, string>[]>();
  for (const row of rowsOf(guide)) {
    const first = Object.values(row)[0] ?? '';
    for (const [, id = ''] of first.matchAll(CODE_ID)) {
      byId.set(id, [...(byId.get(id) ?? []), row]);
    }
  }
  return byId;
}

export function optionalGuideCell(guide: string, id: string, header: string): string | undefined {
  return (readGuideTables(guide).get(id) ?? [])
    .map((row) => row[header])
    .find((text) => text !== undefined);
}

export function guideCell(guide: string, id: string, header: string): string {
  const cell = optionalGuideCell(guide, id, header);
  if (cell === undefined) {
    throw new Error(`${guide} has no table row for ${id} with a "${header}" column`);
  }
  return cell;
}
