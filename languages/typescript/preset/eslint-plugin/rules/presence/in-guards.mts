import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { TypedFacts } from '../promises/cannot-reject.mts';
import { depthFirst, nameOf } from '../typed/node-views.mts';
import { unwrapped } from '../typed/syntax-views.mts';
import { syntaxChildren } from '../decided/syntax.mts';
import { plainText, siblingsAfter } from './conditions.mts';

export type InCheck = {
  readonly facts: TypedFacts;
  readonly node: TSESTree.BinaryExpression;
  readonly root: TSESTree.Node;
  readonly key: string;
};

const VALIDATOR_NAME = /^(?:is|has|assert|validate)/u;

function memberKey(node: TSESTree.MemberExpression): string | undefined {
  const { property } = node;
  if (!node.computed) {
    return nameOf(property);
  }
  return property.type === AST_NODE_TYPES.Literal && typeof property.value === 'string'
    ? property.value
    : undefined;
}

function readsIn(
  { facts, node, key }: InCheck,
  regions: readonly TSESTree.Node[],
): TSESTree.Node[] {
  const target = plainText(node.right, facts.sourceCode);
  return regions
    .flatMap((region) => [...depthFirst<TSESTree.Node>(region, syntaxChildren)])
    .filter(
      (candidate) =>
        candidate.type === AST_NODE_TYPES.MemberExpression &&
        memberKey(candidate) === key &&
        plainText(unwrapped(candidate.object), facts.sourceCode) === target,
    );
}

function isAbsent(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') ||
    (node.type === AST_NODE_TYPES.Literal && node.value === null)
  );
}

function throws(branch: TSESTree.Node): boolean {
  const last = branch.type === AST_NODE_TYPES.BlockStatement ? branch.body.at(-1) : branch;
  return last?.type === AST_NODE_TYPES.ThrowStatement;
}

function isValidatorCall(parent: TSESTree.Node, node: TSESTree.Node): boolean {
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.callee.type === AST_NODE_TYPES.Identifier &&
    VALIDATOR_NAME.test(parent.callee.name) &&
    parent.arguments.some((argument) => argument === node)
  );
}

function usedAsCheck(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent === undefined) {
    return false;
  }
  switch (parent.type) {
    case AST_NODE_TYPES.UnaryExpression:
      return parent.operator === 'typeof' || parent.operator === '!';
    case AST_NODE_TYPES.IfStatement:
    case AST_NODE_TYPES.ConditionalExpression:
      return parent.test === node;
    case AST_NODE_TYPES.LogicalExpression:
      return true;
    default:
      return isValidatorCall(parent, node);
  }
}

function isValidated(facts: TypedFacts, read: TSESTree.Node): boolean {
  const holder = read.parent;
  if (holder?.type !== AST_NODE_TYPES.VariableDeclarator || holder.init !== read) {
    return usedAsCheck(read);
  }
  return facts.sourceCode
    .getDeclaredVariables(holder)
    .flatMap((variable) => variable.references)
    .some((reference) => reference.identifier !== holder.id && usedAsCheck(reference.identifier));
}

function branchOf(root: TSESTree.Node): TSESTree.Node | undefined {
  const { parent } = root;
  const isTest = parent !== undefined && 'test' in parent && parent.test === root;
  return isTest ? parent : undefined;
}

function isHandledBranch(check: InCheck, branch: TSESTree.Node): boolean {
  if (branch.type === AST_NODE_TYPES.IfStatement) {
    const reads = readsIn(check, [branch.consequent, ...siblingsAfter(branch)]);
    return throws(branch.consequent) || reads.some((read) => isValidated(check.facts, read));
  }
  if (branch.type !== AST_NODE_TYPES.ConditionalExpression) {
    return false;
  }
  const reads = readsIn(check, [branch.consequent]);
  return (
    (reads.length > 0 && isAbsent(branch.alternate)) ||
    reads.some((read) => isValidated(check.facts, read))
  );
}

export function isValueHandled(check: InCheck): boolean {
  const branch = branchOf(check.root);
  return (
    readsIn(check, [check.root]).length > 0 ||
    (branch !== undefined && isHandledBranch(check, branch))
  );
}
