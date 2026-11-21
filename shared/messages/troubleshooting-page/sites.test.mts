import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TROUBLESHOOTING_ANCHORS } from '../troubleshooting.mts';
import {
  pageEntries,
  plainText,
  productionSources,
  read,
  stringConstants,
} from '../test-support/troubleshooting-page.mts';
import { byText } from '../../text-order/by-text.mts';

const LINKING_CALLS = new Set([
  'withTroubleshooting',
  'troubleshootingError',
  'configError',
  'environmentError',
]);
const DEFAULT_ANCHORS = new Map([['environmentError', TROUBLESHOOTING_ANCHORS.pythonEnvironment]]);

type Site = { anchor: string; clauses: string[] };
const MINIMUM_QUOTE = 12;
const CLAUSE_BREAK = /[.:;] | \(/u;
const EDGE_PUNCTUATION = /^[\s.:;,(]+|[\s.:;,(]+$/gu;
const MESSAGES_BUILT_ELSEWHERE = [
  'core/configuration/project-checks/project-root.mts',
  'core/diff/execution/process.mts',
  'core/diff/execution/report/analyzer-report.mts',
  'core/diff/sharding/aggregate-shards.mts',
  'core/fix/tool-steps/commands/fix-command.mts',
  'languages/java/adapters/red-base/tests-failed.mts',
  'languages/java/builds/pit-failure/pit-failure.mts',
  'languages/typescript/preset/notices/empty-sources.mts',
];
const symptoms = new Map(pageEntries().map(({ slug, symptom }) => [slug, symptom]));

function segments(
  node: ts.Node | undefined,
  constants: ReadonlyMap<string, string>,
): (string | undefined)[] {
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

function quotedClauses(
  node: ts.Node | undefined,
  constants: ReadonlyMap<string, string>,
): string[] {
  return segments(node, constants)
    .reduce(
      (joined: string[], part) =>
        part === undefined
          ? [...joined, '']
          : [...joined.slice(0, -1), `${joined.at(-1) ?? ''}${part}`],
      [''],
    )
    .flatMap((fragment: string) => plainText(fragment).split(CLAUSE_BREAK))
    .map((clause) => clause.replaceAll(EDGE_PUNCTUATION, ''))
    .filter((clause) => clause.length >= MINIMUM_QUOTE);
}

function anchorOf(node: ts.Node | undefined): string | undefined {
  if (
    node !== undefined &&
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'TROUBLESHOOTING_ANCHORS'
  ) {
    return Object.entries(TROUBLESHOOTING_ANCHORS).find(([key]) => key === node.name.text)?.[1];
  }
  return undefined;
}

function callSite(
  node: ts.CallExpression,
  constants: ReadonlyMap<string, string>,
): Site | undefined {
  const name = ts.isIdentifier(node.expression) ? node.expression.text : undefined;
  if (name === undefined || !LINKING_CALLS.has(name)) {
    return undefined;
  }
  const [message, anchorArgument] = node.arguments;
  const anchor =
    anchorArgument === undefined ? DEFAULT_ANCHORS.get(name) : anchorOf(anchorArgument);
  return anchor === undefined ? undefined : { anchor, clauses: quotedClauses(message, constants) };
}

function objectSite(
  node: ts.ObjectLiteralExpression,
  constants: ReadonlyMap<string, string>,
): Site | undefined {
  const property = (key: string): ts.ObjectLiteralElementLike | undefined =>
    node.properties.find(
      (candidate) =>
        ts.isPropertyAssignment(candidate) &&
        ts.isIdentifier(candidate.name) &&
        candidate.name.text === key,
    );
  const anchorProperty = property('anchor');
  const messageProperty = property('message');
  const anchor = anchorOf(
    anchorProperty !== undefined && ts.isPropertyAssignment(anchorProperty)
      ? anchorProperty.initializer
      : undefined,
  );
  const message =
    messageProperty !== undefined && ts.isPropertyAssignment(messageProperty)
      ? messageProperty.initializer
      : undefined;
  return anchor === undefined || message === undefined
    ? undefined
    : { anchor, clauses: quotedClauses(message, constants) };
}

function linkingSites(file: string): (Site & { where: string })[] {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const constants = stringConstants(ts, source);
  const sites: (Site & { where: string })[] = [];
  const visit = (node: ts.Node): void => {
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
    expect(
      [...new Set(relinking.map(({ where }) => where.split(':')[0] ?? ''))].toSorted(byText),
    ).toEqual(MESSAGES_BUILT_ELSEWHERE);
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
