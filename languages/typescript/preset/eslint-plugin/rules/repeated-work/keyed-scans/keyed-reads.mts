import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  calledMember,
  memberName,
  someNode,
} from '../../collections/costly-forms/repeated-runs.mts';
import { contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { invariantIn, writtenInside } from '../support/loop-invariance.mts';

export type KeyedRead = { readonly map: TSESTree.Node; readonly key: TSESTree.Node };

function withoutFallback(node: TSESTree.Node): TSESTree.Node {
  const value = unwrapped(node);
  return value.type === AST_NODE_TYPES.LogicalExpression &&
    (value.operator === '??' || value.operator === '||')
    ? unwrapped(value.left)
    : value;
}

function directRead(node: TSESTree.Node): KeyedRead | undefined {
  const value = withoutFallback(node);
  if (value.type !== AST_NODE_TYPES.CallExpression || value.arguments.length !== 1) {
    return undefined;
  }
  const member = calledMember(value);
  const [key] = value.arguments;
  return member !== undefined && memberName(member) === 'get' && key !== undefined
    ? { map: member.object, key }
    : undefined;
}

export function keyedRead(sourceCode: SourceCode, node: TSESTree.Node): KeyedRead | undefined {
  const value = unwrapped(node);
  if (value.type !== AST_NODE_TYPES.Identifier) {
    return directRead(value);
  }
  const declarator = variableNamed(sourceCode, value)?.defs[0]?.node;
  return declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.parent.kind === 'const' &&
    declarator.init !== null
    ? directRead(declarator.init)
    : undefined;
}

function declaredWithin(
  sourceCode: SourceCode,
  node: TSESTree.Identifier,
  area: TSESTree.Node,
): boolean {
  const definition = variableNamed(sourceCode, node)?.defs[0];
  return definition !== undefined && contains(area, definition.name);
}

function changesWithin(
  sourceCode: SourceCode,
  node: TSESTree.Identifier,
  area: TSESTree.Node,
): boolean {
  const variable = variableNamed(sourceCode, node);
  return variable !== undefined && writtenInside(variable, area);
}

export function readsLoopState(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  repeat: TSESTree.Node,
  own: TSESTree.Node,
): boolean {
  return someNode(
    node,
    (child) =>
      child.type === AST_NODE_TYPES.Identifier &&
      ((declaredWithin(sourceCode, child, repeat) && !declaredWithin(sourceCode, child, own)) ||
        changesWithin(sourceCode, child, repeat)),
  );
}

export function isRepeatingKey(
  sourceCode: SourceCode,
  read: KeyedRead,
  repeat: TSESTree.Node,
): boolean {
  const key = unwrapped(read.key);
  return (
    key.type !== AST_NODE_TYPES.Identifier &&
    invariantIn(sourceCode, read.map, repeat) &&
    readsLoopState(sourceCode, read.key, repeat, read.key)
  );
}
