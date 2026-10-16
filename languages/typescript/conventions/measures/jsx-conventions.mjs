import { codeLines, winner } from '../layout-measures.mjs';

const JSX_FILES = ['**/*.{tsx,jsx}'];
const ATTRIBUTE_QUOTE = /\s[\w:-]+=(?:"[^"'\n]*"|'[^"'\n]*')/g;
const ATTRIBUTE_LINE = /^\s+(?:[\w:-]+=(?:"[^"]*"|'[^']*'|\{.*\})|\{\.\.\..*\})(?<closer>>?)$/;
const BARE_CLOSER = /^\s*>$/;

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

function jsxQuotes(text) {
  const code = codeLines(text).join('\n');
  const quotes = (code.match(ATTRIBUTE_QUOTE) ?? []).map((attribute) =>
    attribute.endsWith('"') ? 'double' : 'single',
  );
  return winner({
    double: quotes.filter((quote) => quote === 'double').length,
    single: quotes.filter((quote) => quote === 'single').length,
  });
}

function bracketPlacement(text) {
  const lines = codeLines(text);
  const counts = { newLine: 0, sameLine: 0 };
  for (const [index, line] of lines.entries()) {
    if (BARE_CLOSER.test(line) && ATTRIBUTE_LINE.test(lines[index - 1] ?? '')) {
      counts.newLine += 1;
    }
    if (ATTRIBUTE_LINE.exec(line)?.groups.closer === '>' && !line.endsWith('/>')) {
      counts.sameLine += 1;
    }
  }
  return winner(counts);
}
