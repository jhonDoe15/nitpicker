import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import type { TypedFacts as Facts } from '../promises/cannot-reject.mts';
import { depthFirst, nameOf, variableNamed } from '../typed/node-views.mts';
import { unwrapped } from '../typed/syntax-views.mts';
import { syntaxChildren } from '../decided/syntax.mts';
import { includesUndefined } from '../presence/value-facts.mts';

const OPTIONS_TYPE = /(?:Options|Config|Settings|Props)$/u;
const OVERRIDE_NAME = /^(?:\w*overrides?|\w*defaults?|rest|extra)$/iu;
const TEST_SUPPORT_PATH = /(?:^|[\\/])(?:testing|test-utils|__fixtures__|__mocks__)[\\/]/u;

export function optionalPropertyOf(
  facts: Facts,
  spread: TSESTree.Node,
  key: string,
): { readonly typeName: string } | undefined {
  const { services } = facts;
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(spread));
  const property = checker.getPropertyOfType(type, key);
  if (property === undefined) {
    return undefined;
  }
  const valueType = checker.getTypeOfSymbolAtLocation(
    property,
    services.esTreeNodeToTSNodeMap.get(spread),
  );
  const first: TypeScript.Type = type.isUnion() ? (type.types[0] ?? type) : type;
  const name = type.aliasSymbol?.getName() ?? first.getSymbol()?.getName() ?? '';
  return includesUndefined(valueType) ? { typeName: name } : undefined;
}

export function isOptionsType(typeName: string): boolean {
  return OPTIONS_TYPE.test(typeName);
}

export function keyName(property: TSESTree.Property): string | undefined {
  if (property.computed || property.kind !== 'init') {
    return undefined;
  }
  const { key } = property;
  if (key.type === AST_NODE_TYPES.Literal) {
    return typeof key.value === 'string' ? key.value : undefined;
  }
  return key.type === AST_NODE_TYPES.Identifier ? key.name : undefined;
}

export function isTextOrNumber(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal &&
      (typeof node.value === 'string' || typeof node.value === 'number')) ||
    (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0)
  );
}

export function rootIdentifier(node: TSESTree.Node): TSESTree.Identifier | undefined {
  let current = node;
  while (current.type === AST_NODE_TYPES.MemberExpression) {
    current = current.object;
  }
  return current.type === AST_NODE_TYPES.Identifier ? current : undefined;
}

export function isParameterBased(facts: Facts, node: TSESTree.Node): boolean {
  const root = rootIdentifier(node);
  const definition =
    root === undefined ? undefined : variableNamed(facts.sourceCode, root)?.defs.at(0);
  return definition?.type === TSESLint.Scope.DefinitionType.Parameter;
}

export function readsFrom(facts: Facts, value: TSESTree.Node, spread: TSESTree.Node): boolean {
  const target = facts.sourceCode.getText(spread);
  return [...depthFirst<TSESTree.Node>(value, syntaxChildren)].some(
    (node) =>
      node.type === AST_NODE_TYPES.MemberExpression &&
      nameOf(node.object) !== undefined &&
      facts.sourceCode.getText(node.object) === target,
  );
}

export function isParameterValue(facts: Facts, node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Identifier && isParameterBased(facts, node);
}

export function isTestSupportFile(filename: string): boolean {
  return TEST_SUPPORT_PATH.test(filename);
}

function literalKeys(node: TSESTree.Node): Set<string> | undefined {
  const target = unwrapped(node);
  if (target.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  const keys = target.properties.map((property) =>
    property.type === AST_NODE_TYPES.Property ? keyName(property) : undefined,
  );
  return new Set(keys.filter((key) => key !== undefined));
}

export function isIntentionalSpread(spread: TSESTree.Node, key: string): boolean {
  const target = unwrapped(spread);
  const name = nameOf(target.type === AST_NODE_TYPES.MemberExpression ? target.property : target);
  return (
    (name !== undefined && OVERRIDE_NAME.test(name)) || literalKeys(spread)?.has(key) === false
  );
}
