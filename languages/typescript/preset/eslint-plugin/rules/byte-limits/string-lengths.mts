import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { plainName } from '../encoding/plain-names.mts';
import { valueKind, type ValueKind } from '../encoding/value-kinds.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';

const BYTE_WORDS = new Set(['byte', 'bytes']);
const MEASURES = new Set([
  'bytelength',
  'byteoffset',
  'bytesread',
  'byteswritten',
  'bytesreceived',
]);
const STRING_CALLS = new Set(['stringify', 'String', 'trim', 'toString', 'join', 'toLowerCase']);

function words(name: string): string[] {
  return name
    .replace(/([a-z\d])([A-Z])/gu, '$1 $2')
    .split(/[\s_$-]+/u)
    .map((word) => word.toLowerCase());
}

function isByteName(name: string | undefined): boolean {
  return (
    name !== undefined &&
    !MEASURES.has(name.toLowerCase()) &&
    words(name).some((word) => BYTE_WORDS.has(word))
  );
}

export function leaves(node: TSESTree.Node): TSESTree.Node[] {
  const found: TSESTree.Node[] = [];
  const pending = [node];
  for (const current of pending) {
    const plain = unwrapped(current);
    if (
      plain.type === AST_NODE_TYPES.BinaryExpression &&
      ['+', '-', '*'].includes(plain.operator)
    ) {
      pending.push(plain.left, plain.right);
    } else {
      found.push(plain);
    }
  }
  return found;
}

export function hasByteName(node: TSESTree.Node): boolean {
  return leaves(node).some((leaf) => isByteName(plainName(leaf)));
}

function annotatedAsString(context: Context, identifier: TSESTree.Identifier): boolean {
  const definition = findVariable(context, identifier, identifier.name)?.defs.at(0);
  const name = definition?.name;
  if (name?.type === AST_NODE_TYPES.Identifier && name.typeAnnotation !== undefined) {
    return name.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSStringKeyword;
  }
  const declarator = definition?.node;
  return (
    declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.init !== null &&
    isTextLiteral(declarator.init)
  );
}

function isTextLiteral(node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  return (
    plain.type === AST_NODE_TYPES.TemplateLiteral ||
    (plain.type === AST_NODE_TYPES.Literal && typeof plain.value === 'string')
  );
}

function isTextKind(kind: Exclude<ValueKind, 'unknown'>): boolean {
  switch (kind) {
    case 'text':
    case 'literals':
      return true;
    case 'number':
      return false;
  }
}

export function isText(context: Context, node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  const kind = valueKind(context, plain);
  if (kind !== 'unknown') {
    return isTextKind(kind);
  }
  if (plain.type === AST_NODE_TYPES.Identifier) {
    return annotatedAsString(context, plain);
  }
  if (plain.type === AST_NODE_TYPES.CallExpression) {
    return STRING_CALLS.has(plainName(plain.callee) ?? '') && plainName(plain.callee) !== 'join';
  }
  return isTextLiteral(plain);
}

function isTextLength(context: Context, node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  return (
    plain.type === AST_NODE_TYPES.MemberExpression &&
    memberName(plain) === 'length' &&
    isText(context, plain.object)
  );
}

export function hasTextLength(context: Context, node: TSESTree.Node): boolean {
  return leaves(node).some((leaf) => isTextLength(context, leaf));
}
