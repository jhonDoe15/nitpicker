import { descendants, parsedSource } from './typescript-syntax.mjs';

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

export function assertionFunctionNames(conventions = {}) {
  return [...DEFAULT_ASSERTION_FUNCTIONS, ...(conventions[ASSERTION_HELPERS_CONVENTION.id] ?? [])];
}

function followedHelpers(counts, { minFiles }) {
  return Object.keys(counts)
    .filter((key) => key.startsWith('use:'))
    .map((key) => key.slice('use:'.length))
    .filter((name) => counts[`use:${name}`] >= minFiles)
    .filter((name) => (counts[`def:${name}`] ?? 0) > 0);
}

function rootName(ts, expression) {
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
  const root = chain.at(-1);
  return ts.isIdentifier(root) ? root.text : undefined;
}

function headLink(ts, node) {
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

function isTestHead(ts, expression) {
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
  const root = chain.at(-1);
  return ts.isIdentifier(root) && TEST_ROOTS.has(root.text);
}

function isFunction(ts, node) {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function testCallbacks(ts, nodes) {
  return nodes
    .filter((node) => ts.isCallExpression(node) && isTestHead(ts, node.expression))
    .flatMap((node) => node.arguments.filter((argument) => isFunction(ts, argument)));
}

function assertsInside(ts, root, { throwing }) {
  return descendants(ts, root).some(
    (node) =>
      (ts.isCallExpression(node) &&
        DEFAULT_ASSERTION_FUNCTIONS.includes(rootName(ts, node.expression))) ||
      (throwing && ts.isThrowStatement(node)),
  );
}

function definedAssertions(ts, nodes) {
  return nodes.flatMap((node) => {
    const declaresFunction = ts.isFunctionDeclaration(node) && node.name !== undefined;
    const declaresConstant =
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isFunction(ts, node.initializer);
    const body = declaresFunction ? node.body : node.initializer?.body;
    const name = (declaresFunction || declaresConstant) && node.name.text;
    return name && body !== undefined && assertsInside(ts, body, { throwing: true }) ? [name] : [];
  });
}

function unwrapped(ts, expression) {
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
  return chain.at(-1);
}

function terminalExpression(ts, callback) {
  const { body } = callback;
  if (!ts.isBlock(body)) {
    return body;
  }
  const last = body.statements.at(-1);
  const isTerminal =
    last !== undefined && (ts.isExpressionStatement(last) || ts.isReturnStatement(last));
  return isTerminal ? last.expression : undefined;
}

function terminalCalls(ts, nodes) {
  return testCallbacks(ts, nodes)
    .filter((callback) => !assertsInside(ts, callback.body, { throwing: false }))
    .map((callback) => terminalExpression(ts, callback))
    .filter((expression) => expression !== undefined)
    .map((expression) => unwrapped(ts, expression))
    .filter((expression) => ts.isCallExpression(expression))
    .map((expression) => rootName(ts, expression.expression));
}

function assertionHelperEvidence(text, file) {
  const { ts, source } = parsedSource(text, file);
  const nodes = descendants(ts, source);
  const used = terminalCalls(ts, nodes).filter((name) => name !== undefined);
  return [
    ...new Set(used.map((name) => `use:${name}`)),
    ...new Set(definedAssertions(ts, nodes).map((name) => `def:${name}`)),
  ];
}
