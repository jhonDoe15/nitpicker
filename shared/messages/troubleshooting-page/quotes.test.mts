import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TROUBLESHOOTING_FILE } from '../troubleshooting.mts';
import {
  pageEntries,
  productionSources,
  read,
  stringConstants,
} from '../test-support/troubleshooting-page.mts';

const MINIMUM_QUOTE = 12;
const MINIMUM_LITERAL = 10;
const SHARED_RUN = 8;
const LONGEST_VALUE = 60;
const QUOTED_FROM_OTHER_TOOLS = new Set([
  "error TS5083: Cannot read file '.../tsconfig.json'",
  'error TS5057',
  "Cannot find package 'vitest' imported from <file>",
]);
const CLAUSE_END = /(?<=[.:;]) /u;
const TRAILING_PUNCTUATION = /[.:;,]+$/u;
const VALUE: unique symbol = Symbol('value');
const ELIDED: unique symbol = Symbol('elided');
const PLACEHOLDER = /<[^>]*>|\.\.\./gu;

type Token = string | typeof VALUE | typeof ELIDED;
type Part = string | typeof VALUE;
type State = { position: number; absorbed: number; literal: number };
type Constants = ReadonlyMap<string, string>;

function spaced(text: string): string {
  return text.replaceAll(/[\\`]/gu, '').replaceAll(/\s+/gu, ' ');
}

function partsOf(node: ts.Node, constants: Constants): Part[] {
  if (ts.isStringLiteralLike(node)) {
    return [node.text];
  }
  const constant = ts.isIdentifier(node) ? constants.get(node.text) : undefined;
  if (constant !== undefined) {
    return [constant];
  }
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.flatMap((span) => [
        ...partsOf(span.expression, constants),
        span.literal.text,
      ]),
    ];
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...partsOf(node.left, constants), ...partsOf(node.right, constants)];
  }
  return [VALUE];
}

function isText(node: ts.Node): boolean {
  return (
    ts.isStringLiteralLike(node) ||
    ts.isTemplateExpression(node) ||
    (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
  );
}

function parsed(file: string): ts.SourceFile {
  return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
}

function sharedConstants(sources: readonly ts.SourceFile[]): Constants {
  const values = new Map<string, string[]>();
  for (const [name, value] of sources.flatMap((source: ts.SourceFile) => [
    ...stringConstants(ts, source),
  ])) {
    values.set(name, [...new Set([...(values.get(name) ?? []), value])]);
  }
  return new Map(
    [...values].flatMap(([name, found]) =>
      found.length === 1 && found[0] !== undefined ? [[name, found[0]] as const] : [],
    ),
  );
}

type SourceString = { tokens: Part[]; text: string };

function sourceStrings(source: ts.SourceFile, shared: Constants): SourceString[] {
  const constants = new Map([...shared, ...stringConstants(ts, source)]);
  const strings: { tokens: Part[]; text: string[] }[] = [];
  const pending: ts.Node[] = [source];
  for (const node of pending) {
    if (isText(node)) {
      const tokens = partsOf(node, constants).flatMap((part): Part[] =>
        part === VALUE ? [VALUE] : Array.from(spaced(part)),
      );
      strings.push({ tokens, text: tokens.map((token) => (token === VALUE ? '\0' : token)) });
    }
    pending.push(...node.getChildren(source));
  }
  return strings.map(({ tokens, text }) => ({ tokens, text: text.join('') }));
}

function quotedTokens(span: string): Token[] {
  return span.split(PLACEHOLDER).flatMap((piece, index): Token[] => {
    const elided: Token[] = index === 0 ? [] : [ELIDED];
    return [...elided, ...Array.from(spaced(piece))];
  });
}

function runsOf(span: string): string[] {
  return span
    .split(PLACEHOLDER)
    .map(spaced)
    .flatMap((piece) =>
      Array.from({ length: Math.max(0, piece.length - SHARED_RUN + 1) }, (_unused, start) =>
        piece.slice(start, start + SHARED_RUN),
      ),
    );
}

function stateKey({ position, absorbed, literal }: State): string {
  return `${String(position)}:${String(absorbed)}:${String(literal)}`;
}

function closure(states: readonly State[], code: readonly Token[]): State[] {
  const all = new Map(states.map((state) => [stateKey(state), state]));
  for (const { position, literal } of all.values()) {
    if (code[position] === VALUE) {
      const skipped = { position: position + 1, absorbed: 0, literal };
      all.set(stateKey(skipped), skipped);
    }
  }
  return [...all.values()];
}

function step(
  states: readonly State[],
  token: Token,
  { code, needed }: { code: readonly Token[]; needed: number },
): State[] {
  return states.flatMap(({ position, absorbed, literal }): State[] => {
    if (token === ELIDED) {
      return Array.from({ length: code.length - position + 1 }, (_unused, offset) => ({
        position: position + offset,
        absorbed: 0,
        literal,
      }));
    }
    if (code[position] === VALUE) {
      return absorbed < LONGEST_VALUE ? [{ position, absorbed: absorbed + 1, literal }] : [];
    }
    return position < code.length && code[position] === token
      ? [{ position: position + 1, absorbed: 0, literal: Math.min(needed, literal + 1) }]
      : [];
  });
}

function producedBy(quoted: readonly Token[], code: readonly Token[]): boolean {
  const needed = Math.min(
    MINIMUM_LITERAL,
    Math.ceil(quoted.filter((token) => token !== ELIDED).length / 2),
  );
  const start = Array.from({ length: code.length + 1 }, (_unused, position) => ({
    position,
    absorbed: 0,
    literal: 0,
  }));
  const reached = quoted.reduce(
    (states, token) => closure(step(closure(states, code), token, { code, needed }), code),
    start,
  );
  return reached.some(({ literal }) => literal >= needed);
}

function runOwners(
  strings: readonly SourceString[],
  wanted: ReadonlySet<string>,
): Map<string, Set<number>> {
  const owners = new Map([...wanted].map((run): [string, Set<number>] => [run, new Set()]));
  for (const [owner, { text }] of strings.entries()) {
    const runs = Array.from(
      { length: Math.max(0, text.length - SHARED_RUN + 1) },
      (_unused, start) => text.slice(start, start + SHARED_RUN),
    );
    for (const run of runs) {
      owners.get(run)?.add(owner);
    }
  }
  return owners;
}

function byHits(
  runs: readonly string[],
  owners: ReadonlyMap<string, ReadonlySet<number>>,
): number[] {
  const hits = new Map<number, number>();
  for (const run of new Set(runs)) {
    for (const owner of owners.get(run) ?? []) {
      hits.set(owner, (hits.get(owner) ?? 0) + 1);
    }
  }
  return [...hits].toSorted((left, right) => right[1] - left[1]).map(([owner]) => owner);
}

function quotedSpans(): { slug: string; span: string }[] {
  return pageEntries().flatMap(({ slug, rawSymptom }) =>
    [...rawSymptom.replaceAll(/\s+/gu, ' ').matchAll(/`([^`]+)`/gu)]
      .map(([, quote = '']) => quote)
      .filter((quote) => !QUOTED_FROM_OTHER_TOOLS.has(quote))
      .flatMap((quote) => quote.split(CLAUSE_END))
      .map((clause) => ({ slug, span: clause.trim().replace(TRAILING_PUNCTUATION, '') }))
      .filter(
        ({ span }) =>
          span.includes(' ') && span.replaceAll(PLACEHOLDER, '').length >= MINIMUM_QUOTE,
      ),
  );
}

describe('the symptoms of the troubleshooting page', () => {
  it('quote only text that a string in the code can produce', () => {
    const sources = productionSources().map(parsed);
    const shared = sharedConstants(sources);
    const strings = sources.flatMap((source) => sourceStrings(source, shared));
    const spans = quotedSpans().map((entry) => ({ ...entry, runs: runsOf(entry.span) }));
    const owners = runOwners(strings, new Set(spans.flatMap(({ runs }) => runs)));
    const unmatched = spans
      .filter(({ span, runs }) => {
        const quoted = quotedTokens(span);
        return !byHits(runs, owners).some((owner) =>
          producedBy(quoted, strings[owner]?.tokens ?? []),
        );
      })
      .map(({ slug, span }) => `${TROUBLESHOOTING_FILE}#${slug}: ${span}`);

    expect(unmatched).toEqual([]);
  });

  it('catches a quote that no string can produce', () => {
    const code = sourceStringsOf(`\`Required tool \${name} is not installed from \${from}\``);

    expect(producedBy(quotedTokens('Required tool vitest is not installed from <dir>'), code)).toBe(
      true,
    );
    expect(producedBy(quotedTokens('which must be 5.7 to 6.x'), code)).toBe(false);
    expect(
      producedBy(
        quotedTokens(
          `Required tool vitest is not installed from ${'a long folder name '.repeat(4)}`,
        ),
        code,
      ),
    ).toBe(false);
  });
});

function sourceStringsOf(expression: string): Token[] {
  const source = ts.createSourceFile('x.mjs', expression, ts.ScriptTarget.Latest, true);
  const [statement] = source.statements;
  if (statement === undefined || !ts.isExpressionStatement(statement)) {
    throw new Error('Expected an expression statement');
  }
  return partsOf(statement.expression, new Map()).flatMap((part): Token[] =>
    part === VALUE ? [VALUE] : Array.from(spaced(part)),
  );
}
