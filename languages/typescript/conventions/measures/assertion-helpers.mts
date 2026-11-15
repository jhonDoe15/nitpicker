import type TypeScript from 'typescript';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';
import { descendants, parsedSource } from '../typed/measure-views.mts';

type Ts = typeof TypeScript;
type Node = TypeScript.Node;
type Callback = TypeScript.ArrowFunction | TypeScript.FunctionExpression;

const TEST_ROOTS = new Set(['it', 'test']);
const TEST_MODIFIERS = new Set([
  'only',
  'skip',
  'concurrent',
  'sequential',
  'each',
  'for',
  'fails',
  'todo',
  'runIf',
  'skipIf',
]);
const DEFAULT_ASSERTION_FUNCTIONS = ['expect', 'assert', 'expectTypeOf', 'assertType'];

export const ASSERTION_HELPERS_CONVENTION = {
  id: 'typescript.assertionHelpers',
  label: 'Assertion helpers',
  kind: 'names',
  fallback: [],
  minFiles: 3,
  files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
  scope: 'test-code',
  sampleLimit: 1000,
  measure: assertionHelperEvidence,
  choose: followedHelpers,
};

export function assertionFunctionNames(conventions: object = {}): string[] {
  return [
    ...DEFAULT_ASSERTION_FUNCTIONS,
    ...textsOf(fieldOf(conventions, ASSERTION_HELPERS_CONVENTION.id)),
  ];
}

function followedHelpers(
  counts: Readonly<Record<string, number>>,
  { minFiles }: { readonly minFiles: number },
): string[] {
  return Object.keys(counts)
    .filter((key) => key.startsWith('use:'))
    .map((key) => key.slice('use:'.length))
    .filter((name) => (counts[`use:${name}`] ?? 0) >= minFiles)
    .filter((name) => (counts[`def:${name}`] ?? 0) > 0);
}

function rootName(ts: Ts, expression: Node): string | undefined {
  const chain = [expression];
  for (const node of chain) {
    const isChain =
      ts.isCallExpression(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node);
    if (isChain) {
      chain.push(node.expression);
    }
  }
  const root = chain.at(-1) ?? expression;
  return ts.isIdentifier(root) ? root.text : undefined;
}

function headLink(ts: Ts, node: Node): Node | undefined {
  if (ts.isCallExpression(node)) {
    return node.expression;
  }
  if (ts.isTaggedTemplateExpression(node)) {
    return node.tag;
  }
  if (ts.isPropertyAccessExpression(node) && TEST_MODIFIERS.has(node.name.text)) {
    return node.expression;
  }
  return ts.isIdentifier(node) ? node : undefined;
}

function isTestHead(ts: Ts, expression: Node): boolean {
  const chain = [expression];
  for (const node of chain) {
    const next = headLink(ts, node);
    if (next === undefined) {
      return false;
    }
    if (next !== node) {
      chain.push(next);
    }
  }
  const root = chain.at(-1) ?? expression;
  return ts.isIdentifier(root) && TEST_ROOTS.has(root.text);
}

function isFunction(ts: Ts, node: Node | undefined): node is Callback {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function testCallbacks(ts: Ts, nodes: Node[]): Callback[] {
  return nodes.flatMap((node) =>
    ts.isCallExpression(node) && isTestHead(ts, node.expression)
      ? node.arguments.filter((argument) => isFunction(ts, argument))
      : [],
  );
}

function assertsInside(ts: Ts, root: Node, { throwing }: { readonly throwing: boolean }): boolean {
  return descendants(ts, root).some(
    (node) =>
      (ts.isCallExpression(node) &&
        DEFAULT_ASSERTION_FUNCTIONS.includes(rootName(ts, node.expression) ?? '')) ||
      (throwing && ts.isThrowStatement(node)),
  );
}

function declaration(ts: Ts, node: Node): { name: string; body: Node } | undefined {
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
    return node.body === undefined || node.name.text === ''
      ? undefined
      : { name: node.name.text, body: node.body };
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    isFunction(ts, node.initializer)
  ) {
    return node.name.text === ''
      ? undefined
      : { name: node.name.text, body: node.initializer.body };
  }
  return undefined;
}

function definedAssertions(ts: Ts, nodes: Node[]): string[] {
  return nodes.flatMap((node) => {
    const declared = declaration(ts, node);
    return declared !== undefined && assertsInside(ts, declared.body, { throwing: true })
      ? [declared.name]
      : [];
  });
}

function unwrapped(ts: Ts, expression: Node): Node {
  const chain = [expression];
  for (const node of chain) {
    const isWrapper =
      ts.isAwaitExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node);
    if (isWrapper) {
      chain.push(node.expression);
    }
  }
  return chain.at(-1) ?? expression;
}

function terminalExpression(ts: Ts, callback: Callback): Node | undefined {
  const { body } = callback;
  if (!ts.isBlock(body)) {
    return body;
  }
  const last = body.statements.at(-1);
  const isTerminal =
    last !== undefined && (ts.isExpressionStatement(last) || ts.isReturnStatement(last));
  return isTerminal ? last.expression : undefined;
}

function terminalCalls(ts: Ts, nodes: Node[]): (string | undefined)[] {
  return testCallbacks(ts, nodes)
    .filter((callback) => !assertsInside(ts, callback.body, { throwing: false }))
    .map((callback) => terminalExpression(ts, callback))
    .filter((expression): expression is Node => expression !== undefined)
    .map((expression) => unwrapped(ts, expression))
    .filter((expression): expression is TypeScript.CallExpression =>
      ts.isCallExpression(expression),
    )
    .map((expression) => rootName(ts, expression.expression));
}

function assertionHelperEvidence(text: string, file: string): string[] {
  const { ts, source } = parsedSource(text, file);
  const nodes = descendants(ts, source);
  const used = terminalCalls(ts, nodes).filter((name) => name !== undefined);
  return [
    ...new Set(used.map((name) => `use:${name}`)),
    ...new Set(definedAssertions(ts, nodes).map((name) => `def:${name}`)),
  ];
}
