import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst, nameOf, nodeChildren, type SourceCode } from '../typed/node-views.mts';
import { enclosingFunction } from '../react/react-effects.mts';

const SPECIAL_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const FILTER_METHODS = new Set(['has', 'includes', 'test']);
const GUARD_NAME = /proto|unsafe|dangerous|forbidden|blocked|isplain/i;

export function descendants(node: TSESTree.Node): Iterable<TSESTree.Node> {
  return depthFirst<TSESTree.Node>(node, nodeChildren);
}

function calleeName(node: TSESTree.CallExpression, sourceCode: SourceCode): string {
  return node.callee.type === AST_NODE_TYPES.MemberExpression
    ? (nameOf(node.callee.property) ?? '')
    : sourceCode.getText(node.callee);
}

function ownCheckTexts(node: TSESTree.CallExpression, sourceCode: SourceCode): string[] {
  const [first] = node.arguments;
  const owner =
    node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.object : undefined;
  return [owner, first].flatMap((part) => (part === undefined ? [] : [sourceCode.getText(part)]));
}

function isOwnCheck(name: string, text: string): boolean {
  return /^hasOwn(Property)?$/.test(name) || (name === 'call' && /hasOwn(Property)?$/.test(text));
}

export type GuardQuery = {
  readonly node: TSESTree.Node;
  readonly target: string;
  readonly key: string;
  readonly sourceCode: SourceCode;
};

export function guardsTarget({ node, target, key, sourceCode }: GuardQuery): boolean {
  for (const current of descendants(enclosingFunction(node) ?? sourceCode.ast)) {
    if (current.type === AST_NODE_TYPES.Literal && SPECIAL_KEYS.has(String(current.value))) {
      return true;
    }
    if (current.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    const name = calleeName(current, sourceCode);
    const texts = ownCheckTexts(current, sourceCode);
    const filtersKey =
      FILTER_METHODS.has(name) && current.arguments.some((argument) => nameOf(argument) === key);
    if (
      filtersKey ||
      GUARD_NAME.test(name) ||
      (isOwnCheck(name, texts[0] ?? '') && texts.includes(target))
    ) {
      return true;
    }
  }
  return false;
}
