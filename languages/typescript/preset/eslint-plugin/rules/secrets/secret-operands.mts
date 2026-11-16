import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isSecretName } from '../../../../../../shared/naming/secret-words.mjs';
import { foldTree } from '../typed/node-views.mts';
import { envKey, memberName, unwrapped } from './secret-nodes.mts';

type Kept = TSESTree.Node[] | undefined;

const STATE_PREFIX = /^(?:has|is)[A-Z_]/;
const SCREAMING_CASE = /^[A-Z][A-Z0-9_]*$/;
const NOT_SECRET_OWNERS = new Set(['tokenizer', 'tokenizers']);
const TEXT_CALLS = new Set(['String', 'JSON.stringify']);
const PLAIN_VALUES = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.TemplateLiteral,
]);

function namesASecret(name: string | undefined): boolean {
  return (
    name !== undefined &&
    !STATE_PREFIX.test(name) &&
    !SCREAMING_CASE.test(name) &&
    isSecretName(name)
  );
}

function ownerName(member: TSESTree.MemberExpression): string | undefined {
  const object = unwrapped(member.object);
  return object.type === AST_NODE_TYPES.Identifier ? object.name.toLowerCase() : undefined;
}

function propertyKeyName(property: TSESTree.Property): string | undefined {
  if (property.computed) {
    return property.key.type === AST_NODE_TYPES.Literal ? String(property.key.value) : undefined;
  }
  return property.key.type === AST_NODE_TYPES.Identifier
    ? property.key.name
    : String(property.key.value);
}

function isPlainValue(value: TSESTree.Node): boolean {
  const inner = unwrapped(value);
  return (
    PLAIN_VALUES.has(inner.type) &&
    !(inner.type === AST_NODE_TYPES.Identifier && inner.name === 'undefined')
  );
}

function namedProperty(property: TSESTree.Property): boolean {
  return namesASecret(propertyKeyName(property)) && isPlainValue(property.value);
}

function callTarget(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  const callee = unwrapped(call.callee);
  const name = callee.type === AST_NODE_TYPES.Identifier ? callee.name : undefined;
  const object =
    callee.type === AST_NODE_TYPES.MemberExpression ? unwrapped(callee.object) : undefined;
  const method = callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
  const qualified =
    object?.type === AST_NODE_TYPES.Identifier && method !== undefined
      ? `${object.name}.${method}`
      : name;
  if (TEXT_CALLS.has(qualified ?? '') && call.arguments.length > 0) {
    return call.arguments[0];
  }
  const toString =
    callee.type === AST_NODE_TYPES.MemberExpression && memberName(callee) === 'toString';
  return toString ? callee.object : undefined;
}

function memberOperand(member: TSESTree.MemberExpression): TSESTree.Node[] {
  const key = envKey(member);
  const secret =
    key === undefined
      ? namesASecret(memberName(member))
      : isSecretName(key) && !STATE_PREFIX.test(key);
  return secret && !NOT_SECRET_OWNERS.has(ownerName(member) ?? '') ? [member] : [];
}

function operandChildren(inner: TSESTree.Node): TSESTree.Node[] {
  if (inner.type === AST_NODE_TYPES.TemplateLiteral) {
    return inner.expressions;
  }
  if (inner.type === AST_NODE_TYPES.BinaryExpression) {
    return inner.operator === '+' ? [inner.left, inner.right] : [];
  }
  if (inner.type === AST_NODE_TYPES.LogicalExpression) {
    return inner.operator === '&&' ? [inner.right] : [inner.left, inner.right];
  }
  if (inner.type === AST_NODE_TYPES.ConditionalExpression) {
    return [inner.consequent, inner.alternate];
  }
  if (inner.type === AST_NODE_TYPES.ArrayExpression) {
    return inner.elements.filter((element) => element !== null);
  }
  return inner.type === AST_NODE_TYPES.CallExpression
    ? [callTarget(inner)].filter((target) => target !== undefined)
    : [];
}

function operandEntries(
  node: TSESTree.Node,
  kept: Kept,
): readonly (readonly [TSESTree.Node, Kept])[] {
  if (kept !== undefined) {
    return [];
  }
  const inner = unwrapped(node);
  if (inner.type === AST_NODE_TYPES.ObjectExpression) {
    return inner.properties
      .filter((property) => property.type !== AST_NODE_TYPES.SpreadElement)
      .map((property): readonly [TSESTree.Node, Kept] => [
        property.value,
        namedProperty(property) ? [property] : undefined,
      ]);
  }
  return operandChildren(inner).map((child): readonly [TSESTree.Node, Kept] => [child, undefined]);
}

function combineOperands(
  node: TSESTree.Node,
  kept: Kept,
  childResults: TSESTree.Node[][],
): TSESTree.Node[] {
  if (kept !== undefined) {
    return kept;
  }
  const inner = unwrapped(node);
  if (inner.type === AST_NODE_TYPES.Identifier) {
    return namesASecret(inner.name) ? [inner] : [];
  }
  return inner.type === AST_NODE_TYPES.MemberExpression
    ? memberOperand(inner)
    : childResults.flat();
}

export function secretOperands(node: TSESTree.Node): TSESTree.Node[] {
  return foldTree<TSESTree.Node, Kept, TSESTree.Node[]>(node, undefined, {
    expand: operandEntries,
    combine: combineOperands,
  });
}
