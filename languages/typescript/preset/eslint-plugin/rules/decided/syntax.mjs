import { chainOf, depthFirst } from '../../../../../../shared/traversal.mjs';

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const SKIPPED = new Set(['parent', 'loc', 'range', 'tokens', 'comments']);

function isSyntax(value) {
  return value !== null && typeof value === 'object' && typeof value.type === 'string';
}

function syntaxIn(value) {
  if (Array.isArray(value)) {
    return value.filter(isSyntax);
  }
  return isSyntax(value) ? [value] : [];
}

/** The syntax nodes directly below `node`, without positions or the parent link. */
export function syntaxChildren(node) {
  return Object.keys(node)
    .filter((name) => !SKIPPED.has(name))
    .flatMap((name) => syntaxIn(node[name]));
}

/** Whether `node` starts a function of its own. */
export function isFunction(node) {
  return FUNCTIONS.has(node.type);
}

/** `root` and the syntax below it, without entering functions nested in it. */
export function inside(root) {
  return depthFirst(root, (node) =>
    isFunction(node) && node !== root ? [] : syntaxChildren(node),
  );
}

/** The syntax of an expression outside the functions in it: none when it is a function itself. */
export function outsideFunctions(root) {
  return depthFirst(root, (node) => (isFunction(node) ? [] : syntaxChildren(node)));
}

const REFERENCES = new Set(['Identifier', 'MemberExpression', 'ChainExpression', 'ThisExpression']);
const EQUALITIES = new Set(['===', '!==', '==', '!=']);

function withoutNegation(node) {
  return chainOf(node, (current) =>
    current.type === 'UnaryExpression' && current.operator === '!' ? current.argument : undefined,
  ).at(-1);
}

function isNullish(node) {
  return (
    (node.type === 'Literal' && node.value === null && node.raw === 'null') ||
    (node.type === 'Identifier' && node.name === 'undefined')
  );
}

/**
 * Whether TypeScript narrows on `node` itself: a truthiness test of one reference, or one compared
 * with `null` or `undefined`. `@typescript-eslint/no-unnecessary-condition` reports those already.
 */
export function isNarrowingTest(node) {
  const test = withoutNegation(node);
  if (REFERENCES.has(test.type)) {
    return true;
  }
  if (test.type !== 'BinaryExpression' || !EQUALITIES.has(test.operator)) {
    return false;
  }
  const sides = [test.left, test.right];
  return sides.some(isNullish) && sides.some((side) => REFERENCES.has(side.type));
}
