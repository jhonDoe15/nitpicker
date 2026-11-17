import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../typed/node-views.mts';
import { afterEffects, effectsOf, type FlowContext } from '../effects.mts';
import { fact, type Fact } from '../facts.mts';
import { isFunction, syntaxChildren } from '../syntax.mts';

type SiteScan = { readonly sourceCode: SourceCode; readonly flow: FlowContext };
type Site = { readonly node: TSESTree.Node; readonly extra: readonly Fact[] };

const CHAINS = new Set(['&&', '||']);

function isChainHead(node: TSESTree.LogicalExpression): boolean {
  const { parent } = node;
  const continues =
    parent.type === AST_NODE_TYPES.LogicalExpression && parent.operator === node.operator;
  const isTernaryTest =
    parent.type === AST_NODE_TYPES.ConditionalExpression && parent.test === node;
  return CHAINS.has(node.operator) && !continues && !isTernaryTest;
}

function branchFacts(node: TSESTree.ConditionalExpression, scan: SiteScan, holds: boolean): Fact[] {
  const { sourceCode, flow } = scan;
  const line = String(node.test.loc.start.line);
  const text = sourceCode.getText(node.test);
  const reason = `it is in the ${holds ? 'true' : 'false'} branch of the conditional \`${text}\` on line ${line}`;
  const known = fact(node.test, sourceCode, { holds, reason });
  return afterEffects([known], effectsOf([node.test], flow), flow.mutable);
}

function childSites(node: TSESTree.Node, extra: readonly Fact[], scan: SiteScan): Site[] {
  const children = syntaxChildren(node);
  if (node.type !== AST_NODE_TYPES.ConditionalExpression) {
    return children.map((child) => ({ node: child, extra }));
  }
  const whenTrue = branchFacts(node, scan, true);
  const whenFalse = branchFacts(node, scan, false);
  return children.map((child) => {
    if (child === node.consequent) {
      return { node: child, extra: [...extra, ...whenTrue] };
    }
    return { node: child, extra: child === node.alternate ? [...extra, ...whenFalse] : extra };
  });
}

/**
 * The conditions of one expression that are checked on their own, outside nested functions: the
 * test of a conditional and each `&&`/`||` chain, with the facts of the conditional branch they
 * sit in.
 */
export function sitesIn(expression: TSESTree.Node, scan: SiteScan): Site[] {
  const sites: Site[] = [];
  const pending: Site[] = [{ node: expression, extra: [] }];
  for (const { node, extra } of pending) {
    if (isFunction(node)) {
      continue;
    }
    if (node.type === AST_NODE_TYPES.ConditionalExpression) {
      sites.push({ node: node.test, extra });
    } else if (node.type === AST_NODE_TYPES.LogicalExpression && isChainHead(node)) {
      sites.push({ node, extra });
    }
    pending.push(...childSites(node, extra, scan));
  }
  return sites;
}
