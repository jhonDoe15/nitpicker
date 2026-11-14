import { afterEffects, effectsOf, fact } from '../facts.mjs';
import { isFunction, syntaxChildren } from '../syntax.mjs';

const CHAINS = new Set(['&&', '||']);

function isChainHead(node) {
  const { parent } = node;
  const continues = parent?.type === 'LogicalExpression' && parent.operator === node.operator;
  const isTernaryTest = parent?.type === 'ConditionalExpression' && parent.test === node;
  return CHAINS.has(node.operator) && !continues && !isTernaryTest;
}

function branchFacts(node, scan) {
  const { sourceCode, flow } = scan;
  const line = String(node.test.loc.start.line);
  return [true, false].map((holds) => {
    const reason = `it is in the ${holds ? 'true' : 'false'} branch of the conditional \`${sourceCode.getText(node.test)}\` on line ${line}`;
    const known = fact(node.test, sourceCode, { holds, reason });
    return afterEffects([known], effectsOf([node.test], flow), flow.mutable);
  });
}

function extraFor(node, child, { extra, branches }) {
  if (child === node.consequent) {
    return [...extra, ...branches[0]];
  }
  return child === node.alternate ? [...extra, ...branches[1]] : extra;
}

/**
 * The conditions of one expression that are checked on their own, outside nested functions: the
 * test of a conditional and each `&&`/`||` chain, with the facts of the conditional branch they
 * sit in.
 */
export function sitesIn(expression, scan) {
  const sites = [];
  const pending = [{ node: expression, extra: [] }];
  for (const { node, extra } of pending) {
    if (isFunction(node)) {
      continue;
    }
    if (node.type === 'ConditionalExpression') {
      sites.push({ node: node.test, extra });
    } else if (node.type === 'LogicalExpression' && isChainHead(node)) {
      sites.push({ node, extra });
    }
    const branches = node.type === 'ConditionalExpression' ? branchFacts(node, scan) : [];
    pending.push(
      ...syntaxChildren(node).map((child) => ({
        node: child,
        extra: extraFor(node, child, { extra, branches }),
      })),
    );
  }
  return sites;
}
