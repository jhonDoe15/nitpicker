import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TROUBLESHOOTING_FILE } from './troubleshooting.mjs';
import {
  pageEntries,
  productionSources,
  read,
  stringConstants,
} from './test-support/troubleshooting-page.mjs';

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
const VALUE = Symbol('value');
const ELIDED = Symbol('elided');
const PLACEHOLDER = /<[^>]*>|\.\.\./gu;

function spaced(text) {
  return text.replaceAll(/[\\`]/gu, '').replaceAll(/\s+/gu, ' ');
}

function partsOf(node, constants) {
  if (ts.isStringLiteralLike(node)) {
    return [node.text];
  }
  if (ts.isIdentifier(node) && constants.has(node.text)) {
    return [constants.get(node.text)];
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

function isText(node) {
  return (
    ts.isStringLiteralLike(node) ||
    ts.isTemplateExpression(node) ||
    (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
  );
}

function parsed(file) {
  return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
}

function sharedConstants(sources) {
  const values = new Map();
  for (const [name, value] of sources.flatMap((source) => [...stringConstants(source)])) {
    values.set(name, [...new Set([...(values.get(name) ?? []), value])]);
  }
  return new Map(
    [...values].filter(([, found]) => found.length === 1).map(([name, [value]]) => [name, value]),
  );
}

function sourceStrings(source, shared) {
  const constants = new Map([...shared, ...stringConstants(source)]);
  const strings = [];
  const pending = [source];
  for (const node of pending) {
    if (isText(node)) {
      const tokens = partsOf(node, constants).flatMap((part) =>
        part === VALUE ? [VALUE] : [...spaced(part)],
      );
      strings.push({ tokens, text: tokens.map((token) => (token === VALUE ? '\0' : token)) });
    }
    pending.push(...node.getChildren(source));
  }
  return strings.map(({ tokens, text }) => ({ tokens, text: text.join('') }));
}

function quotedTokens(span) {
  return span
    .split(PLACEHOLDER)
    .flatMap((piece, index) => [...(index === 0 ? [] : [ELIDED]), ...spaced(piece)]);
}

function runsOf(span) {
  return span
    .split(PLACEHOLDER)
    .map(spaced)
    .flatMap((piece) =>
      Array.from({ length: Math.max(0, piece.length - SHARED_RUN + 1) }, (_unused, start) =>
        piece.slice(start, start + SHARED_RUN),
      ),
    );
}

function stateKey({ position, absorbed, literal }) {
  return `${String(position)}:${String(absorbed)}:${String(literal)}`;
}

function closure(states, code) {
  const all = new Map(states.map((state) => [stateKey(state), state]));
  for (const { position, literal } of all.values()) {
    if (code[position] === VALUE) {
      const skipped = { position: position + 1, absorbed: 0, literal };
      all.set(stateKey(skipped), skipped);
    }
  }
  return [...all.values()];
}

function step(states, token, { code, needed }) {
  return states.flatMap(({ position, absorbed, literal }) => {
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

function producedBy(quoted, code) {
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

function quotedSpans() {
  return pageEntries().flatMap(({ slug, rawSymptom }) =>
    [...rawSymptom.replaceAll(/\s+/gu, ' ').matchAll(/`([^`]+)`/gu)]
      .filter(([, quote]) => !QUOTED_FROM_OTHER_TOOLS.has(quote))
      .flatMap(([, quote]) => quote.split(CLAUSE_END))
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
    const unmatched = quotedSpans()
      .filter(({ span }) => {
        const quoted = quotedTokens(span);
        const runs = runsOf(span);
        return !strings.some(
          ({ tokens, text }) =>
            runs.some((run) => text.includes(run)) && producedBy(quoted, tokens),
        );
      })
      .map(({ slug, span }) => `${TROUBLESHOOTING_FILE}#${slug}: ${span}`);

    expect(unmatched).toEqual([]);
  });

  it('catches a quote that no string can produce', () => {
    const code = sourceStringsOf('`Required tool ${name} is not installed from ${from}`');

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

function sourceStringsOf(expression) {
  const source = ts.createSourceFile('x.mjs', expression, ts.ScriptTarget.Latest, true);
  const [statement] = source.statements;
  return partsOf(statement.expression, new Map()).flatMap((part) =>
    part === VALUE ? [VALUE] : [...spaced(part)],
  );
}
