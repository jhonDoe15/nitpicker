import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../analysis/constant-resolution.mts';
import { unchained } from '../text-splits/split-calls.mts';

const FILE_READERS = new Set(['readFile', 'readFileSync', 'readTextFile', 'readTextFileSync']);
const TEXT_STEPS = new Set(['toString', 'trim', 'trimEnd', 'trimStart']);
const MAX_STEPS = 8;

function calleeName(node: TSESTree.CallExpression): string | undefined {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : undefined;
}

function isBunFileText(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.property.type !== AST_NODE_TYPES.Identifier ||
    callee.property.name !== 'text'
  ) {
    return false;
  }
  const file = unchained(callee.object);
  return (
    file.type === AST_NODE_TYPES.CallExpression &&
    file.callee.type === AST_NODE_TYPES.MemberExpression &&
    file.callee.object.type === AST_NODE_TYPES.Identifier &&
    ['Bun', 'Deno'].includes(file.callee.object.name)
  );
}

function stepInner(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee } = node;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    TEXT_STEPS.has(callee.property.name)
    ? callee.object
    : undefined;
}

function readsFile(value: TSESTree.CallExpression): boolean {
  return FILE_READERS.has(calleeName(value) ?? '') || isBunFileText(value);
}

function innerStep(value: TSESTree.Node): TSESTree.Node | undefined | false {
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return value.argument;
  }
  return value.type === AST_NODE_TYPES.CallExpression ? stepInner(value) : false;
}

export function isFileText(context: SourceContext, node: TSESTree.Node): boolean {
  const pending: TSESTree.Node[] = [node];
  for (const current of pending) {
    if (pending.length > MAX_STEPS) {
      return false;
    }
    const value: TSESTree.Node = unchained(resolveConstant(context, current) ?? current);
    if (value.type === AST_NODE_TYPES.CallExpression && readsFile(value)) {
      return true;
    }
    const inner = innerStep(value);
    if (inner === false) {
      return false;
    }
    if (inner !== undefined) {
      pending.push(inner);
    }
  }
  return false;
}

export function isCommentValue(node: TSESTree.Node): boolean {
  const value = unchained(node);
  return (
    value.type === AST_NODE_TYPES.MemberExpression &&
    !value.computed &&
    value.property.type === AST_NODE_TYPES.Identifier &&
    value.property.name === 'value' &&
    /comment/iu.test(value.object.type === AST_NODE_TYPES.Identifier ? value.object.name : '')
  );
}
