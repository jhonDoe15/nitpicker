import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, someNode } from '../../collections/costly-forms/repeated-runs.mts';
import { ancestorsOf, contains, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { readsOnlyFixed, type Repeat } from '../support/loop-invariance.mts';

const CACHE_READS = new Set(['get', 'has']);
const LEAVES = new Set<string>([
  AST_NODE_TYPES.BreakStatement,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
]);

function callsElsewhere(call: TSESTree.Node, boundary: TSESTree.Node): boolean {
  return someNode(
    boundary,
    (node) =>
      (node.type === AST_NODE_TYPES.CallExpression || node.type === AST_NODE_TYPES.NewExpression) &&
      node !== call &&
      !contains(call, node) &&
      unwrapped(node.callee) !== call,
  );
}

function readsCache(test: TSESTree.Node): boolean {
  return someNode(
    test,
    (node) =>
      node.type === AST_NODE_TYPES.CallExpression &&
      CACHE_READS.has(memberName(unwrapped(node.callee)) ?? ''),
  );
}

function cached(call: TSESTree.Node, boundary: TSESTree.Node): boolean {
  const chain = [call, ...ancestorsOf(call)];
  return chain.slice(1, chain.indexOf(boundary)).some((ancestor, index) => {
    const child = chain[index];
    const setter =
      ancestor.type === AST_NODE_TYPES.CallExpression &&
      memberName(unwrapped(ancestor.callee)) === 'set';
    const guarded =
      (ancestor.type === AST_NODE_TYPES.IfStatement ||
        ancestor.type === AST_NODE_TYPES.ConditionalExpression ||
        ancestor.type === AST_NODE_TYPES.LogicalExpression) &&
      child !== ('test' in ancestor ? ancestor.test : ancestor.left) &&
      readsCache('test' in ancestor ? ancestor.test : ancestor.left);
    return setter || guarded;
  });
}

type Loop =
  | TSESTree.DoWhileStatement
  | TSESTree.ForInStatement
  | TSESTree.ForOfStatement
  | TSESTree.ForStatement
  | TSESTree.WhileStatement;

function leavesOnFirstPass(repeat: Repeat): boolean {
  if (repeat.kind !== 'loop') {
    return false;
  }
  const { body } = repeat.node as Loop;
  const last = body.type === AST_NODE_TYPES.BlockStatement ? body.body.at(-1) : body;
  return last !== undefined && LEAVES.has(last.type);
}

export function compiledEachPass(
  sourceCode: SourceCode,
  found: { readonly call: TSESTree.Node; readonly pattern: TSESTree.Node },
  repeat: Repeat,
): boolean {
  const { call, pattern } = found;
  return (
    (readsOnlyFixed(sourceCode, pattern, true) || !callsElsewhere(call, repeat.node)) &&
    !cached(call, repeat.node) &&
    !leavesOnFirstPass(repeat)
  );
}
