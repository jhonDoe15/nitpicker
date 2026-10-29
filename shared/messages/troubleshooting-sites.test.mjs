import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TROUBLESHOOTING_ANCHORS } from './troubleshooting.mjs';
import {
  pageEntries,
  plainText,
  productionSources,
  read,
  stringConstants,
} from './test-support/troubleshooting-page.mjs';

const LINKING_CALLS = new Set([
  'withTroubleshooting',
  'troubleshootingError',
  'configError',
  'environmentError',
]);
const DEFAULT_ANCHORS = new Map([['environmentError', TROUBLESHOOTING_ANCHORS.pythonEnvironment]]);
const MINIMUM_QUOTE = 12;
const CLAUSE_BREAK = /[.:;] | \(/u;
const EDGE_PUNCTUATION = /^[\s.:;,(]+|[\s.:;,(]+$/gu;
const MESSAGES_BUILT_ELSEWHERE = [
  'core/diff/execution/process.mjs',
  'core/diff/reporting/review/policy-findings.mjs',
  'core/diff/sharding/aggregate-shards.mjs',
  'core/fix/run-fix.mjs',
  'languages/java/adapters/red-base/tests-failed.mjs',
];
const symptoms = new Map(pageEntries().map(({ slug, symptom }) => [slug, symptom]));

function segments(node, constants) {
  if (node === undefined) {
    return [undefined];
  }
  if (ts.isStringLiteralLike(node)) {
    return [node.text];
  }
  if (ts.isParenthesizedExpression(node)) {
    return segments(node.expression, constants);
  }
  if (ts.isIdentifier(node) && constants.has(node.text)) {
    return [constants.get(node.text)];
  }
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.flatMap((span) => [
        ...segments(span.expression, constants),
        span.literal.text,
      ]),
    ];
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...segments(node.left, constants), ...segments(node.right, constants)];
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => [...segments(element, constants), undefined]);
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    return segments(node.expression.expression, constants);
  }
  return [undefined];
}

function quotedClauses(node, constants) {
  return segments(node, constants)
    .reduce(
      (joined, part) =>
        part === undefined ? [...joined, ''] : [...joined.slice(0, -1), `${joined.at(-1)}${part}`],
      [''],
    )
    .flatMap((fragment) => plainText(fragment).split(CLAUSE_BREAK))
    .map((clause) => clause.replaceAll(EDGE_PUNCTUATION, ''))
    .filter((clause) => clause.length >= MINIMUM_QUOTE);
}

function anchorOf(node) {
  if (
    node !== undefined &&
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'TROUBLESHOOTING_ANCHORS'
  ) {
    return TROUBLESHOOTING_ANCHORS[node.name.text];
  }
  return undefined;
}

function callSite(node, constants) {
  const name = ts.isIdentifier(node.expression) ? node.expression.text : undefined;
  if (!LINKING_CALLS.has(name)) {
    return undefined;
  }
  const [message, anchorArgument] = node.arguments;
  const anchor =
    anchorArgument === undefined ? DEFAULT_ANCHORS.get(name) : anchorOf(anchorArgument);
  return anchor === undefined ? undefined : { anchor, clauses: quotedClauses(message, constants) };
}

function objectSite(node, constants) {
  const property = (key) =>
    node.properties.find(
      (candidate) =>
        ts.isPropertyAssignment(candidate) &&
        ts.isIdentifier(candidate.name) &&
        candidate.name.text === key,
    );
  const anchor = anchorOf(property('anchor')?.initializer);
  const message = property('message')?.initializer;
  return anchor === undefined || message === undefined
    ? undefined
    : { anchor, clauses: quotedClauses(message, constants) };
}

function linkingSites(file) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const constants = stringConstants(source);
  const sites = [];
  const visit = (node) => {
    const site = ts.isCallExpression(node)
      ? callSite(node, constants)
      : ts.isObjectLiteralExpression(node)
        ? objectSite(node, constants)
        : undefined;
    if (site !== undefined) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      sites.push({ where: `${file}:${String(line + 1)}`, ...site });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}

const sites = productionSources()
  .filter((file) => !file.startsWith('shared/messages/'))
  .flatMap(linkingSites);

describe('each message that links to the troubleshooting page', () => {
  it('is found in the code, and only sites that link a message built elsewhere quote nothing', () => {
    const relinking = sites.filter(({ clauses }) => clauses.length === 0);

    expect(sites.length).toBeGreaterThan(40);
    expect([...new Set(relinking.map(({ where }) => where.split(':')[0]))].toSorted()).toEqual(
      MESSAGES_BUILT_ELSEWHERE,
    );
  });

  it('is quoted in the symptom of the entry it links to, so the two cannot drift apart', () => {
    const unquoted = sites
      .filter(({ clauses }) => clauses.length > 0)
      .filter(
        ({ anchor, clauses }) => !clauses.some((clause) => symptoms.get(anchor)?.includes(clause)),
      )
      .map(({ where, anchor, clauses }) => `${where} #${anchor}: ${clauses.join(' | ')}`);

    expect(unquoted).toEqual([]);
  });
});
