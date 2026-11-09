import { depthFirst } from '../../../../../../shared/traversal.mjs';

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
