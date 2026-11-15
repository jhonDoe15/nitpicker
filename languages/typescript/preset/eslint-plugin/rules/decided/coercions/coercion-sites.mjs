import { syntaxChildren, isFunction } from '../syntax.mjs';

const REFERENCES = new Set(['Identifier', 'MemberExpression', 'ChainExpression']);

function isNegation(node) {
  return node.type === 'UnaryExpression' && node.operator === '!';
}

function coercedOperand(node) {
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'Boolean' &&
    node.arguments.length === 1
  ) {
    return node.arguments[0];
  }
  return isNegation(node) && isNegation(node.argument) ? node.argument.argument : undefined;
}

function guardedChildren(node) {
  if (node.type === 'ConditionalExpression') {
    return [
      { child: node.test, guard: undefined },
      { child: node.consequent, guard: { test: node.test, holds: true, branch: node.consequent } },
      { child: node.alternate, guard: { test: node.test, holds: false, branch: node.alternate } },
    ];
  }
  if (node.type === 'LogicalExpression' && node.operator !== '??') {
    return [
      { child: node.left, guard: undefined },
      {
        child: node.right,
        guard: { test: node.left, holds: node.operator === '&&', branch: node.right },
      },
    ];
  }
  return syntaxChildren(node).map((child) => ({ child, guard: undefined }));
}

/**
 * The `Boolean(x)` and `!!x` coercions of a reference inside `root`, outside nested functions, each
 * with the tests (`{ test, holds }`) of the conditional branches and `&&`/`||` operands around it.
 */
export function coercionSites(root) {
  const sites = [];
  const pending = [{ node: root, guards: [] }];
  for (const { node, guards } of pending) {
    const operand = coercedOperand(node);
    if (operand !== undefined && REFERENCES.has(operand.type)) {
      sites.push({ node, operand, guards });
    }
    if (!isFunction(node)) {
      pending.push(
        ...guardedChildren(node).map(({ child, guard }) => ({
          node: child,
          guards: guard === undefined ? guards : [...guards, guard],
        })),
      );
    }
  }
  return sites;
}
