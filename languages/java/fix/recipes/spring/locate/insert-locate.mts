import { lineAt } from './lines.mts';
import type { FileKind, Insertion, LineTable } from './locate-types.mts';
import { indentOf } from './yaml-locate.mts';

type FileView = { readonly table: LineTable; readonly lineBreak: string };
type DocumentRange = { readonly first: number; readonly last: number };

const YAML_SEPARATOR = /^---(\s|$)/;
const PROPERTIES_SEPARATOR = /^\s*[#!]---\s*$/;
const SETTING = 'open-in-view';
const INDENT = 2;
const SPRING_LINE = /^spring\s*:\s*(?:#.*)?$/;
const JPA_LINE = /^\s*jpa\s*:\s*(?:#.*)?$/;

function documentLines(
  table: LineTable,
  kind: FileKind,
  firstEntryLine: number | undefined,
): DocumentRange {
  const separator = kind === 'yaml' ? YAML_SEPARATOR : PROPERTIES_SEPARATOR;
  const marks = table.flatMap((line, index) => (separator.test(line.text) ? [index] : []));
  const at = firstEntryLine === undefined ? 0 : firstEntryLine - 1;
  const from = marks.findLast((mark) => mark < at);
  const to = marks.find((mark) => mark > at);
  return { first: from === undefined ? 0 : from + 1, last: (to ?? table.length) - 1 };
}

function lastContent(table: LineTable, { first, last }: DocumentRange): number | undefined {
  const at = table.slice(first, last + 1).findLastIndex((line) => line.text.trim() !== '');
  return at < 0 ? undefined : first + at;
}

function after({ table, lineBreak }: FileView, index: number, text: string): Insertion {
  const line = lineAt(table, index);
  return line.next === line.end
    ? { start: line.end, end: line.end, text: `${lineBreak}${text}` }
    : { start: line.next, end: line.next, text: `${text}${lineBreak}` };
}

function structuralBlock(
  table: LineTable,
  index: number,
  range: DocumentRange,
): { readonly indent: number; readonly at: number }[] {
  const { indent } = indentOf(lineAt(table, index));
  const rest = table
    .slice(index + 1, range.last + 1)
    .map((line, offset) => ({ ...indentOf(line), at: index + 1 + offset }));
  const stop = rest.findIndex((line) => line.structural && line.indent <= indent);
  return (stop < 0 ? rest : rest.slice(0, stop)).filter((line) => line.structural);
}

function padded(width: number, text: string): string {
  return `${' '.repeat(width)}${text}`;
}

function springTree(file: FileView, range: DocumentRange, spring: number): Insertion {
  const { table, lineBreak } = file;
  const block = structuralBlock(table, spring, range);
  const childIndent = block[0]?.indent ?? INDENT;
  const jpa = block.find(
    (line) => line.indent === childIndent && JPA_LINE.test(lineAt(table, line.at).text),
  );
  if (jpa === undefined) {
    const text = [padded(childIndent, 'jpa:'), padded(childIndent * 2, `${SETTING}: false`)];
    return after(file, block.at(-1)?.at ?? spring, text.join(lineBreak));
  }
  const inner = structuralBlock(table, jpa.at, range)[0];
  const width = inner === undefined ? childIndent * 2 : inner.indent;
  return after(file, jpa.at, padded(width, `${SETTING}: false`));
}

function yamlInsertion(file: FileView, range: DocumentRange): Insertion | undefined {
  const { table, lineBreak } = file;
  const lines = table.slice(range.first, range.last + 1);
  const spring = lines.findIndex((line) => SPRING_LINE.test(line.text));
  if (spring >= 0) {
    return springTree(file, range, range.first + spring);
  }
  const end = lastContent(table, range);
  const text = ['spring:', padded(INDENT, 'jpa:'), padded(INDENT * 2, `${SETTING}: false`)];
  return end === undefined ? undefined : after(file, end, text.join(lineBreak));
}

export function openInViewInsertion({
  table,
  kind,
  text,
  firstEntryLine,
}: {
  readonly table: LineTable;
  readonly kind: FileKind;
  readonly text: string;
  readonly firstEntryLine: number | undefined;
}): Insertion | undefined {
  const file = { table, lineBreak: /\r\n|\r|\n/.exec(text)?.[0] ?? '\n' };
  const range = documentLines(table, kind, firstEntryLine);
  if (kind === 'yaml') {
    return yamlInsertion(file, range);
  }
  const end = lastContent(table, range);
  const setting = `spring.jpa.${SETTING}=false`;
  return end === undefined
    ? {
        start: lineAt(table, 0).start,
        end: lineAt(table, 0).start,
        text: `${setting}${file.lineBreak}`,
      }
    : after(file, end, setting);
}
