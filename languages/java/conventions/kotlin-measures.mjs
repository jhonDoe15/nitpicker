import { indentOf } from '../../../shared/conventions/lines.mjs';

const IMPORT = /^import\s+(\S+)/gm;
const DEFAULT_ON_DEMAND = /^(?:java\.util|kotlinx\.android\.synthetic(?:\.[\w.]+)?)\.\*+$/;
const CALL_OPENER = /[\w>]\(\s*(?:\/\/.*)?$/;
const KEYWORD_LINE = /^\s*(?:\}\s*)?(?:else\s+)?(?:if|while|for|when|catch)\b/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;
const TRAILING_COMMENT = /\s+\/\/.*$/;
const MIN_LISTS = 2;

export function wildcardImports(text) {
  const imports = [...text.matchAll(IMPORT)].map((match) => match[1]);
  if (imports.length === 0) {
    return undefined;
  }
  const wildcard = imports.some((name) => name.endsWith('.*') && !DEFAULT_ON_DEMAND.test(name));
  return wildcard ? 'wildcard' : 'explicit';
}

export function trailingCommas(text) {
  const lines = text.split(/\r?\n/);
  const ends = lines.flatMap((line, index) => lastElementEnd(lines, index));
  const withComma = ends.filter((comma) => comma).length;
  const without = ends.length - withComma;
  if (ends.length < MIN_LISTS || withComma === without) {
    return undefined;
  }
  return withComma > without ? 'always' : 'never';
}

function lastElementEnd(lines, index) {
  const line = lines[index];
  if (!CALL_OPENER.test(line) || KEYWORD_LINE.test(line)) {
    return [];
  }
  const indent = indentOf(line);
  const closer = lines.findIndex((other, at) => at > index && indentOf(other) <= indent);
  if (closer <= index + 1 || indentOf(lines[closer]) !== indent || !/^\s*\)/.test(lines[closer])) {
    return [];
  }
  const inner = lines
    .slice(index + 1, closer)
    .filter((other) => other.trim() !== '' && !COMMENT_LINE.test(other));
  const last = inner.at(-1)?.replace(TRAILING_COMMENT, '').trimEnd();
  return last === undefined ? [] : [last.endsWith(',')];
}
