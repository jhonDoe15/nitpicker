import { bracketGroups } from '../../../../shared/conventions/lines.mjs';

const IMPORT = /^import\s+(\S+)/gm;
const DEFAULT_ON_DEMAND = /^(?:java\.util|kotlinx\.android\.synthetic(?:\.[\w.]+)?)\.\*+$/;
const CALL_OPENER = /[\w>]\(\s*(?:\/\/.*)?$/;
const CALL_CLOSER = /^\s*\)/;
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
  const groups = bracketGroups(text.split(/\r?\n/), { opener: CALL_OPENER, closer: CALL_CLOSER });
  const ends = groups.flatMap(lastElementEnd);
  const withComma = ends.filter((comma) => comma).length;
  const without = ends.length - withComma;
  if (ends.length < MIN_LISTS || withComma === without) {
    return undefined;
  }
  return withComma > without ? 'always' : 'never';
}

function lastElementEnd({ opener, inner }) {
  if (KEYWORD_LINE.test(opener)) {
    return [];
  }
  const elements = inner.filter((other) => other.trim() !== '' && !COMMENT_LINE.test(other));
  const last = elements.at(-1)?.replace(TRAILING_COMMENT, '').trimEnd();
  return last === undefined ? [] : [last.endsWith(',')];
}
