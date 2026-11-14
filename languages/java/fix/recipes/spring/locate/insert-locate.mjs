import { indentOf } from './yaml-locate.mjs';

const YAML_SEPARATOR = /^---(\s|$)/;
const PROPERTIES_SEPARATOR = /^\s*[#!]---\s*$/;
const SETTING = 'open-in-view';
const INDENT = 2;
const SPRING_LINE = /^spring\s*:\s*(?:#.*)?$/;
const JPA_LINE = /^\s*jpa\s*:\s*(?:#.*)?$/;

function documentLines(table, kind, firstEntryLine) {
  const separator = kind === 'yaml' ? YAML_SEPARATOR : PROPERTIES_SEPARATOR;
  const marks = table.flatMap((line, index) => (separator.test(line.text) ? [index] : []));
  const at = firstEntryLine === undefined ? 0 : firstEntryLine - 1;
  const from = marks.findLast((mark) => mark < at);
  const to = marks.find((mark) => mark > at);
  return { first: from === undefined ? 0 : from + 1, last: (to ?? table.length) - 1 };
}

function lastContent(table, { first, last }) {
  const at = table.slice(first, last + 1).findLastIndex((line) => line.text.trim() !== '');
  return at < 0 ? undefined : first + at;
}

function after({ table, lineBreak }, index, text) {
  const line = table[index];
  return line.next === line.end
    ? { start: line.end, end: line.end, text: `${lineBreak}${text}` }
    : { start: line.next, end: line.next, text: `${text}${lineBreak}` };
}

function structuralBlock(table, index, range) {
  const { indent } = indentOf(table[index]);
  const rest = table
    .slice(index + 1, range.last + 1)
    .map((line, offset) => ({ ...indentOf(line), at: index + 1 + offset }));
  const stop = rest.findIndex((line) => line.structural && line.indent <= indent);
  return (stop < 0 ? rest : rest.slice(0, stop)).filter((line) => line.structural);
}

function padded(width, text) {
  return `${' '.repeat(width)}${text}`;
}

function springTree(file, range, spring) {
  const { table, lineBreak } = file;
  const block = structuralBlock(table, spring, range);
  const childIndent = block.length === 0 ? INDENT : block[0].indent;
  const jpa = block.find(
    (line) => line.indent === childIndent && JPA_LINE.test(table[line.at].text),
  );
  if (jpa === undefined) {
    const text = [padded(childIndent, 'jpa:'), padded(childIndent * 2, `${SETTING}: false`)];
    return after(file, block.at(-1)?.at ?? spring, text.join(lineBreak));
  }
  const inner = structuralBlock(table, jpa.at, range)[0];
  const width = inner === undefined ? childIndent * 2 : inner.indent;
  return after(file, jpa.at, padded(width, `${SETTING}: false`));
}

function yamlInsertion(file, range) {
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

export function openInViewInsertion({ table, kind, text, firstEntryLine }) {
  const file = { table, lineBreak: /\r\n|\r|\n/.exec(text)?.[0] ?? '\n' };
  const range = documentLines(table, kind, firstEntryLine);
  if (kind === 'yaml') {
    return yamlInsertion(file, range);
  }
  const end = lastContent(table, range);
  const setting = `spring.jpa.${SETTING}=false`;
  return end === undefined
    ? { start: table[0].start, end: table[0].start, text: `${setting}${file.lineBreak}` }
    : after(file, end, setting);
}
