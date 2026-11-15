import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  DISCRIMINANT_KEYS as untypedDiscriminantKeys,
  ESLINT_SEVERITIES as untypedSeverities,
  RULE_KEY_PATTERN as untypedRuleKeyPattern,
} from '../../../../../../shared/literals/repeated-literal-exemptions.mjs';
import { nameOf } from '../typed/node-views.mts';

const DISCRIMINANT_KEYS: readonly string[] = untypedDiscriminantKeys;
const ESLINT_SEVERITIES: readonly unknown[] = untypedSeverities;
const RULE_KEY_PATTERN: string = untypedRuleKeyPattern;

const DISCRIMINANTS = new Set<string>(DISCRIMINANT_KEYS);
const SEVERITIES = new Set<unknown>(ESLINT_SEVERITIES);
const RULE_KEY = new RegExp(RULE_KEY_PATTERN);
const EQUALITY_OPERATORS = new Set<string>(['===', '!==', '==', '!=']);
const MEMBERSHIP_METHODS = new Set<string>(['includes', 'has']);

function isDiscriminantAccess(node: TSESTree.Node | undefined): boolean {
  const access = node?.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
  return (
    access?.type === AST_NODE_TYPES.MemberExpression &&
    !access.computed &&
    access.property.type === AST_NODE_TYPES.Identifier &&
    DISCRIMINANTS.has(access.property.name)
  );
}

export function isDiscriminantComparison(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  return (
    parent.type === AST_NODE_TYPES.BinaryExpression &&
    EQUALITY_OPERATORS.has(parent.operator) &&
    isDiscriminantAccess(parent.left === node ? parent.right : parent.left)
  );
}

function collectionOf(array: TSESTree.ArrayExpression): TSESTree.Node {
  const { parent } = array;
  const isSet =
    parent.type === AST_NODE_TYPES.NewExpression &&
    parent.callee.type === AST_NODE_TYPES.Identifier &&
    parent.callee.name === 'Set' &&
    parent.arguments[0] === array;
  return isSet ? parent : array;
}

export function isDiscriminantList(_node: TSESTree.Node, parent: TSESTree.Node): boolean {
  if (parent.type !== AST_NODE_TYPES.ArrayExpression) {
    return false;
  }
  const collection = collectionOf(parent);
  const access = collection.parent;
  const call = access?.parent;
  return (
    access?.type === AST_NODE_TYPES.MemberExpression &&
    access.object === collection &&
    MEMBERSHIP_METHODS.has(nameOf(access.property) ?? '') &&
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.callee === access &&
    isDiscriminantAccess(call.arguments[0])
  );
}

export function isRuleSeverity(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  const listed = parent.type === AST_NODE_TYPES.ArrayExpression && parent.elements[0] === node;
  const property = listed ? parent.parent : parent;
  return (
    node.type === AST_NODE_TYPES.Literal &&
    SEVERITIES.has(node.value) &&
    property.type === AST_NODE_TYPES.Property &&
    property.value === (listed ? parent : node) &&
    !property.computed &&
    property.key.type === AST_NODE_TYPES.Literal &&
    RULE_KEY.test(String(property.key.value))
  );
}
