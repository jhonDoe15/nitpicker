import type TypeScript from 'typescript';
import type {
  ChoiceDefinition,
  Chooser,
  ChosenOptions,
} from '../typed/prettier-convention-types.mts';
import { winner } from '../layout-measures.mts';
import { descendants, parsedSource } from './typescript-syntax.mts';

const JSX_FILES = ['**/*.{tsx,jsx}'];

export const JSX_CONVENTIONS: readonly ChoiceDefinition[] = [
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

export function jsxConventionOptions(chosen: Chooser): ChosenOptions {
  return {
    ...chosen('prettier.jsxQuotes', (value) => ({ jsxSingleQuote: value === 'single' })),
    ...chosen('prettier.bracketSameLine', (value) => ({ bracketSameLine: value === 'sameLine' })),
  };
}

type JsxNodes = {
  readonly ts: typeof TypeScript;
  readonly source: TypeScript.SourceFile;
  readonly nodes: readonly TypeScript.Node[];
};

function jsxNodes(text: string, file: string): JsxNodes | undefined {
  if (!text.includes('<')) {
    return undefined;
  }
  const { ts, source } = parsedSource(text, file);
  return { ts, source, nodes: descendants(ts, source) };
}

function jsxQuotes(text: string, file: string): string | undefined {
  const parsed = jsxNodes(text, file);
  if (parsed === undefined) {
    return undefined;
  }
  const { ts, nodes } = parsed;
  const quotes = nodes
    .flatMap((node) =>
      ts.isJsxAttribute(node) &&
      node.initializer !== undefined &&
      ts.isStringLiteral(node.initializer)
        ? [node.initializer.getText()]
        : [],
    )
    .filter((literal) => !literal.slice(1, -1).match(/["']/))
    .map((literal) => (literal.startsWith('"') ? 'double' : 'single'));
  return winner({
    double: quotes.filter((quote) => quote === 'double').length,
    single: quotes.filter((quote) => quote === 'single').length,
  });
}

function lineOf(source: TypeScript.SourceFile, position: number): number {
  return source.getLineAndCharacterOfPosition(position).line;
}

function bracketPlacement(text: string, file: string): string | undefined {
  const parsed = jsxNodes(text, file);
  if (parsed === undefined) {
    return undefined;
  }
  const { ts, source, nodes } = parsed;
  const counts = { newLine: 0, sameLine: 0 };
  for (const node of nodes) {
    const attributes = ts.isJsxOpeningElement(node) ? node.attributes.properties : [];
    const closeLine = lineOf(source, node.end - 1);
    const last = attributes.at(-1);
    if (last !== undefined && lineOf(source, node.getStart()) !== closeLine) {
      counts[closeLine > lineOf(source, last.end) ? 'newLine' : 'sameLine'] += 1;
    }
  }
  return winner(counts);
}
