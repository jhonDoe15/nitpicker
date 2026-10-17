import { winner } from '../layout-measures.mjs';
import { descendants, parsedSource } from './typescript-syntax.mjs';

const JSX_FILES = ['**/*.{tsx,jsx}'];

export const JSX_CONVENTIONS = [
  {
    id: 'prettier.jsxQuotes',
    label: 'JSX attribute quotes',
    options: ['double', 'single'],
    optionLabels: { double: 'double ("")', single: "single ('')" },
    fallback: 'double',
    files: JSX_FILES,
    scope: 'layout',
    measure: jsxQuotes,
  },
  {
    id: 'prettier.bracketSameLine',
    label: 'JSX closing bracket',
    options: ['newLine', 'sameLine'],
    optionLabels: { newLine: 'on its own line', sameLine: 'after the last attribute' },
    fallback: 'newLine',
    files: JSX_FILES,
    scope: 'layout',
    measure: bracketPlacement,
  },
];

export function jsxConventionOptions(chosen) {
  return {
    ...chosen('prettier.jsxQuotes', (value) => ({ jsxSingleQuote: value === 'single' })),
    ...chosen('prettier.bracketSameLine', (value) => ({ bracketSameLine: value === 'sameLine' })),
  };
}

function jsxNodes(text, file) {
  if (!text.includes('<')) {
    return { ts: undefined, source: undefined, nodes: [] };
  }
  const { ts, source } = parsedSource(text, file);
  return { ts, source, nodes: descendants(ts, source) };
}

function jsxQuotes(text, file) {
  const { ts, nodes } = jsxNodes(text, file);
  const quotes = nodes
    .filter((node) => ts.isJsxAttribute(node) && node.initializer !== undefined)
    .filter((node) => ts.isStringLiteral(node.initializer))
    .map((node) => node.initializer.getText())
    .filter((literal) => !literal.slice(1, -1).match(/["']/))
    .map((literal) => (literal.startsWith('"') ? 'double' : 'single'));
  return winner({
    double: quotes.filter((quote) => quote === 'double').length,
    single: quotes.filter((quote) => quote === 'single').length,
  });
}

function lineOf(source, position) {
  return source.getLineAndCharacterOfPosition(position).line;
}

function bracketPlacement(text, file) {
  const { ts, source, nodes } = jsxNodes(text, file);
  const counts = { newLine: 0, sameLine: 0 };
  for (const node of nodes) {
    const attributes = ts.isJsxOpeningElement(node) ? node.attributes.properties : [];
    const closeLine = lineOf(source, node.end - 1);
    if (attributes.length > 0 && lineOf(source, node.getStart()) !== closeLine) {
      counts[closeLine > lineOf(source, attributes.at(-1).end) ? 'newLine' : 'sameLine'] += 1;
    }
  }
  return winner(counts);
}
