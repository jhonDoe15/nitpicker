import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { unwrapped } from '../../secrets/secret-nodes.mts';

export type OrmKind = 'read' | 'write';
export type OrmSite = { readonly orm: string; readonly table: string | undefined };
export type ChainStep = {
  readonly name: string | undefined;
  readonly args: readonly TSESTree.Node[] | undefined;
  readonly node: TSESTree.Node;
  readonly isRootCall: boolean;
};
export type CallChain = { readonly root: string | undefined; readonly steps: ChainStep[] };

type Found = {
  readonly step?: ChainStep;
  readonly next?: TSESTree.Node;
  readonly root?: string | undefined;
};

const CALL = AST_NODE_TYPES.CallExpression;
const MEMBER = AST_NODE_TYPES.MemberExpression;

function memberName(member: TSESTree.MemberExpression): string | undefined {
  return member.computed ? stringValue(member.property) : member.property.name;
}

function rootName(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  return node.type === AST_NODE_TYPES.ThisExpression ? 'this' : undefined;
}

function callStep(current: TSESTree.CallExpression): Found {
  const callee = unwrapped(current.callee);
  if (callee.type === MEMBER) {
    const step = {
      name: memberName(callee),
      args: current.arguments,
      node: current,
      isRootCall: false,
    };
    return { step, next: unwrapped(callee.object) };
  }
  const name = callee.type === AST_NODE_TYPES.Identifier ? callee.name : undefined;
  return { step: { name, args: current.arguments, node: current, isRootCall: true }, root: name };
}

function stepOf(current: TSESTree.Node): Found {
  if (current.type === CALL) {
    return callStep(current);
  }
  if (current.type === MEMBER) {
    const step = { name: memberName(current), args: undefined, node: current, isRootCall: false };
    return { step, next: unwrapped(current.object) };
  }
  return { root: rootName(current) };
}

export function callChain(call: TSESTree.Node): CallChain {
  const steps: ChainStep[] = [];
  const pending = [unwrapped(call)];
  let root: string | undefined;
  for (const current of pending) {
    const found = stepOf(current);
    if (found.step !== undefined) {
      steps.push(found.step);
    }
    root = found.root;
    if (found.next !== undefined) {
      pending.push(found.next);
    }
  }
  return { root, steps: steps.toReversed() };
}

export function rootNode(call: TSESTree.Node): TSESTree.Node | undefined {
  const pending = [unwrapped(call)];
  for (const current of pending) {
    if (current.type !== CALL && current.type !== MEMBER) {
      return current;
    }
    pending.push(unwrapped(current.type === CALL ? current.callee : current.object));
  }
  return undefined;
}

export function firstString(args: readonly TSESTree.Node[] | undefined): string | undefined {
  return args === undefined || args.length === 0 ? undefined : stringValue(args[0]);
}
