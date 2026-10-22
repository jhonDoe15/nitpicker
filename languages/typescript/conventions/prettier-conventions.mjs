import { COLUMNS } from '../../../shared/conventions/settings.mjs';
import {
  arrowParentheses,
  bracketSpacing,
  codeEnding,
  codeLines,
  indentationStyle,
  lineEndings,
  quoteStyle,
  semicolonStyle,
  winner,
} from './layout-measures.mjs';
import { JSX_CONVENTIONS, jsxConventionOptions } from './measures/jsx-conventions.mjs';
import { printWidth } from './print-width.mjs';

const SOURCE_FILES = ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];
const OPENER = /[([{]\s*$/;
const CALL_OPENER = /[\w$\])>]\(\s*$/;

function convention(definition) {
  return { ...definition, options: Object.keys(definition.optionLabels), files: SOURCE_FILES };
}

export const PRETTIER_CONVENTIONS = [
  convention({
    id: 'prettier.quotes',
    label: 'Quotes',
    optionLabels: { single: 'single', double: 'double' },
    fallback: 'single',
    measure: quoteStyle,
  }),
  convention({
    id: 'prettier.semicolons',
    label: 'Semicolons',
    optionLabels: { always: 'always', never: 'never' },
    fallback: 'always',
    measure: semicolonStyle,
  }),
  convention({
    id: 'prettier.indentation',
    label: 'Indentation',
    optionLabels: { 2: '2 spaces', 4: '4 spaces', tab: 'tabs' },
    fallback: '2',
    measure: indentationStyle,
  }),
  convention({
    id: 'prettier.printWidth',
    label: 'Line width',
    optionLabels: { 80: '80 columns', 100: '100 columns', 120: '120 columns' },
    fallback: '100',
    ...COLUMNS,
    measure: printWidth,
  }),
  convention({
    id: 'prettier.trailingCommas',
    label: 'Trailing commas',
    optionLabels: { all: 'everywhere', es5: 'not after the last argument', none: 'none' },
    fallback: 'all',
    measure: trailingCommas,
  }),
  convention({
    id: 'prettier.arrowParens',
    label: 'Arrow function parameter',
    optionLabels: { always: '(x) =>', avoid: 'x =>' },
    fallback: 'always',
    measure: arrowParentheses,
  }),
  convention({
    id: 'prettier.bracketSpacing',
    label: 'Braces',
    optionLabels: { spaced: '{ a }', tight: '{a}' },
    fallback: 'spaced',
    measure: bracketSpacing,
  }),
  convention({
    id: 'prettier.endOfLine',
    label: 'Line endings',
    optionLabels: { lf: 'LF', crlf: 'CRLF' },
    fallback: 'lf',
    measure: lineEndings,
  }),
];

export function prettierConventionOptions(conventions = {}) {
  const chosen = chooser(conventions);
  return {
    ...chosen('prettier.quotes', (value) => ({ singleQuote: value === 'single' })),
    ...chosen('prettier.semicolons', (value) => ({ semi: value === 'always' })),
    ...chosen('prettier.indentation', (value) =>
      value === 'tab' ? { useTabs: true } : { useTabs: false, tabWidth: Number(value) },
    ),
    ...chosen('prettier.printWidth', (value) => ({ printWidth: Number(value) })),
    ...chosen('prettier.trailingCommas', (value) => ({ trailingComma: value })),
    ...chosen('prettier.arrowParens', (value) => ({ arrowParens: value })),
    ...chosen('prettier.bracketSpacing', (value) => ({ bracketSpacing: value === 'spaced' })),
    ...chosen('prettier.endOfLine', (value) => ({ endOfLine: value })),
    ...jsxConventionOptions(chosen),
  };
}

export function followedPrettierOptions(conventions = {}) {
  return prettierConventionOptions(
    Object.fromEntries(
      [...PRETTIER_CONVENTIONS, ...JSX_CONVENTIONS].map(({ id, fallback }) => [
        id,
        conventions[id] ?? fallback,
      ]),
    ),
  );
}

export function hasPrettierConventions(conventions = {}) {
  return Object.keys(conventions).some((id) => id.startsWith('prettier.'));
}

function chooser(conventions) {
  return function chosen(id, mapping) {
    return conventions[id] === undefined ? {} : mapping(conventions[id]);
  };
}

function trailingCommas(text) {
  const lines = codeLines(text);
  const blocksCloseBare = semicolonStyle(text) === 'never';
  const counts = { callComma: 0, callBare: 0, literalComma: 0, literalBare: 0 };
  for (const index of lines.slice(0, -1).keys()) {
    const vote = closerVote(lines, index, blocksCloseBare);
    if (vote !== undefined) {
      counts[vote] += 1;
    }
  }
  return trailingCommaStyle(counts);
}

function closerVote(lines, index, blocksCloseBare) {
  const line = lines[index];
  const closing = lines[index + 1].trimStart();
  const end = codeEnding(line);
  const comma = end.endsWith(',');
  const unvoted =
    !')]}'.includes(closing[0] ?? 'x') ||
    OPENER.test(end) ||
    /[;}>`]$/.test(end) ||
    line.trimStart().startsWith('...') ||
    closing.includes('`') ||
    isGrouping(lines, index + 1) ||
    (!comma && (closing.startsWith(') {') || (closing[0] === '}' && blocksCloseBare)));
  return unvoted
    ? undefined
    : `${closing[0] === ')' ? 'call' : 'literal'}${comma ? 'Comma' : 'Bare'}`;
}

function isGrouping(lines, closerIndex) {
  const closer = lines[closerIndex];
  if (!closer.trimStart().startsWith(')')) {
    return false;
  }
  const indent = closer.length - closer.trimStart().length;
  const opener = lines
    .slice(0, closerIndex)
    .findLast((line) => line.length - line.trimStart().length === indent);
  return opener !== undefined && OPENER.test(opener) && !CALL_OPENER.test(opener);
}

function trailingCommaStyle({ callComma, callBare, literalComma, literalBare }) {
  const literal = winner({ comma: literalComma, bare: literalBare });
  const call = winner({ comma: callComma, bare: callBare });
  if (literal === 'bare') {
    return call === 'comma' ? undefined : 'none';
  }
  if (call === 'comma') {
    return 'all';
  }
  return call === 'bare' && literal === 'comma' ? 'es5' : undefined;
}
