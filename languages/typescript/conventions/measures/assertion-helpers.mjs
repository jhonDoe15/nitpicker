import { createRequire } from 'node:module';

const TEST_ROOTS = new Set(['it', 'test']);
const CANDIDATE_CALL =
  /\b((?:assert|expect|verify|check|ensure|should|must|confirm)[A-Z0-9_$]\w*)\s*\(/g;

const DEFAULT_ASSERTION_FUNCTIONS = ['expect', 'assert', 'expectTypeOf', 'assertType'];

export const ASSERTION_HELPERS_CONVENTION = {
  id: 'typescript.assertionHelpers',
  label: 'Assertion helpers',
  kind: 'names',
  fallback: [],
  minFiles: 3,
  files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
  scope: 'tests',
  measure: terminalAssertionHelpers,
};

export function assertionFunctionNames(conventions = {}) {
  return [...DEFAULT_ASSERTION_FUNCTIONS, ...(conventions[ASSERTION_HELPERS_CONVENTION.id] ?? [])];
}

function rootName(ts, expression) {
  const chain = [expression];
  for (const node of chain) {
    if (
      ts.isCallExpression(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      chain.push(node.expression);
    }
  }
  const root = chain.at(-1);
  return ts.isIdentifier(root) ? root.text : undefined;
}

function isTestCall(ts, node) {
  return ts.isCallExpression(node) && TEST_ROOTS.has(rootName(ts, node.expression));
}

function testCallbacks(ts, source) {
  const pending = [source];
  const callbacks = [];
  for (const node of pending) {
    if (isTestCall(ts, node)) {
      callbacks.push(
        ...node.arguments.filter(
          (argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
        ),
      );
    }
    pending.push(...node.getChildren());
  }
  return callbacks;
}

function unwrapped(ts, expression) {
  const chain = [expression];
  for (const node of chain) {
    if (
      ts.isAwaitExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
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
  return last !== undefined && (ts.isExpressionStatement(last) || ts.isReturnStatement(last))
    ? last.expression
    : undefined;
}

function terminalAssertionHelpers(text, file) {
  const mentioned = [...text.matchAll(CANDIDATE_CALL)]
    .map(([, name]) => name)
    .filter((name) => !DEFAULT_ASSERTION_FUNCTIONS.includes(name));
  if (mentioned.length === 0) {
    return [];
  }
  const ts = createRequire(import.meta.url)('typescript');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const names = testCallbacks(ts, source)
    .map((callback) => terminalExpression(ts, callback))
    .filter((expression) => expression !== undefined)
    .map((expression) => unwrapped(ts, expression))
    .filter((expression) => ts.isCallExpression(expression))
    .map((expression) => rootName(ts, expression));
  return [...new Set(names.filter((name) => mentioned.includes(name)))];
}
