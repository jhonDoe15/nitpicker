import {
  AST_NODE_TYPES,
  type ParserServices,
  type ParserServicesWithTypeInformation,
  TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { chainOf, isNode } from '../typed/node-views.mts';
import { findVariable, resolveConstant, stringValue } from '../analysis/constant-resolution.mts';
import { declaredMemberValue } from './member-values.mts';

export type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;
type TypeWrapper =
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.TSTypeAssertion
  | TSESTree.ChainExpression;
type MaybeNode = TSESTree.Node | undefined;
type Expansion = { readonly leaves: TSESTree.Node[]; readonly next: TSESTree.Node[] };

const MAX_DEPTH = 8;
export const DEPTHS = Array.from({ length: MAX_DEPTH }, (_, index) => index);
const TEXT_PRESERVING_METHODS = new Set(['toLowerCase', 'toUpperCase', 'trim', 'toString']);

export function isLiteral(node: MaybeNode, value: unknown): boolean {
  return node?.type === AST_NODE_TYPES.Literal && node.value === value;
}

export function isTypeWrapper(node: MaybeNode): node is TypeWrapper {
  return (
    node?.type === AST_NODE_TYPES.TSAsExpression ||
    node?.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node?.type === AST_NODE_TYPES.TSNonNullExpression ||
    node?.type === AST_NODE_TYPES.TSTypeAssertion ||
    node?.type === AST_NODE_TYPES.ChainExpression
  );
}

function hasProgram(
  services: Partial<ParserServices> | undefined,
): services is ParserServicesWithTypeInformation {
  return services?.program !== undefined && services.program !== null;
}

export function typeServices(context: Context): ParserServicesWithTypeInformation | undefined {
  const services = context.sourceCode.parserServices;
  return hasProgram(services) ? services : undefined;
}

export function callName(
  call: TSESTree.CallExpression | TSESTree.NewExpression,
): string | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
}

export function unwrapped(node: TSESTree.Node): TSESTree.Node;
export function unwrapped(node: MaybeNode): MaybeNode;
export function unwrapped(node: MaybeNode): MaybeNode {
  const chain = [node];
  for (const current of chain) {
    if (isTypeWrapper(current)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

export function staticKey(property: TSESTree.Node): string | undefined {
  if (
    property.type !== AST_NODE_TYPES.Property &&
    property.type !== AST_NODE_TYPES.PropertyDefinition
  ) {
    return undefined;
  }
  if (!property.computed && property.key.type === AST_NODE_TYPES.Identifier) {
    return property.key.name;
  }
  return (
    stringValue(property.key) ??
    (property.key.type === AST_NODE_TYPES.Literal ? String(property.key.value) : undefined)
  );
}

function isFreeze(node: TSESTree.Node | undefined): node is TSESTree.CallExpression {
  const callee = node?.type === AST_NODE_TYPES.CallExpression ? node.callee : undefined;
  return (
    callee?.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Object' &&
    memberName(callee) === 'freeze'
  );
}

function constantValue(context: Context, node: MaybeNode): TSESTree.Node | undefined {
  return unwrapped(resolveConstant(context, unwrapped(node)));
}

export function resolvedValue(context: Context, node: MaybeNode): TSESTree.Node | undefined {
  const start = constantValue(context, node);
  return chainOf(start, (value) =>
    isFreeze(value) ? constantValue(context, value.arguments[0]) : undefined,
  ).at(-1);
}

function isProperty(node: TSESTree.Node): node is TSESTree.Property {
  return node.type === AST_NODE_TYPES.Property;
}

function objectProperties(
  context: Context,
  node: MaybeNode,
): TSESTree.ObjectLiteralElement[] | undefined {
  const object = resolvedValue(context, node);
  return object?.type === AST_NODE_TYPES.ObjectExpression ? object.properties : undefined;
}

function expandSpreads(
  context: Context,
  entries: TSESTree.ObjectLiteralElement[],
): TSESTree.ObjectLiteralElement[] {
  return entries.flatMap(
    (entry) =>
      (entry.type === AST_NODE_TYPES.SpreadElement
        ? objectProperties(context, entry.argument)
        : undefined) ?? [entry],
  );
}

function flattenedProperties(context: Context, node: MaybeNode): TSESTree.ObjectLiteralElement[] {
  const initial = objectProperties(context, node) ?? [];
  return DEPTHS.reduce((entries) => expandSpreads(context, entries), initial);
}

export function propertyNamed(
  context: Context,
  node: MaybeNode,
  name: string,
): TSESTree.Node | undefined {
  const found = flattenedProperties(context, node)
    .filter(isProperty)
    .findLast((entry) => staticKey(entry) === name);
  return found?.value;
}

export function memberName(member: TSESTree.MemberExpression): string | undefined {
  if (!member.computed && member.property.type === AST_NODE_TYPES.Identifier) {
    return member.property.name;
  }
  return member.computed ? stringValue(member.property) : undefined;
}

function writtenValues(context: Context, identifier: TSESTree.Identifier): TSESTree.Node[] {
  const variable = findVariable(context, identifier, identifier.name);
  if (variable === undefined) {
    return [];
  }
  const defaults = variable.defs.flatMap((definition) => {
    const { parent } = definition.name;
    return parent.type === AST_NODE_TYPES.AssignmentPattern ? [parent.right] : [];
  });
  const writes = variable.references
    .filter((reference) => reference.isWrite())
    .map((reference) => reference.writeExpr)
    .filter(isNode);
  return [...new Set([...defaults, ...writes])];
}

function lookupValues(context: Context, object: MaybeNode): TSESTree.Node[] | undefined {
  const resolved = resolvedValue(context, object);
  if (resolved?.type === AST_NODE_TYPES.ArrayExpression) {
    const { elements } = resolved;
    const values = elements.flatMap((element) =>
      element === null || element.type === AST_NODE_TYPES.SpreadElement ? [] : [element],
    );
    return values.length === elements.length ? values : undefined;
  }
  const entries =
    resolved?.type === AST_NODE_TYPES.ObjectExpression ? flattenedProperties(context, object) : [];
  const properties = entries.filter(isProperty);
  const plain = entries.length > 0 && properties.length === entries.length;
  return plain ? properties.map((entry) => entry.value) : undefined;
}

function declaredExpansion(
  context: Context,
  resolved: TSESTree.MemberExpression,
  name: string,
): Expansion {
  const declared = declaredMemberValue(context, resolved, name);
  if (declared === undefined) {
    return { leaves: [resolved], next: [] };
  }
  return { leaves: declared.fixed ? [] : [resolved], next: [declared.value] };
}

function memberExpansion(context: Context, resolved: TSESTree.MemberExpression): Expansion {
  const name = memberName(resolved);
  const target = name === undefined ? undefined : propertyNamed(context, resolved.object, name);
  if (target !== undefined) {
    return { leaves: [], next: [target] };
  }
  const values =
    resolved.computed && name === undefined ? lookupValues(context, resolved.object) : undefined;
  if (values !== undefined) {
    return { leaves: [], next: values };
  }
  return name === undefined
    ? { leaves: [resolved], next: [] }
    : declaredExpansion(context, resolved, name);
}

function forOfElements(
  context: Context,
  identifier: TSESTree.Identifier,
): TSESTree.Node[] | undefined {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const declaration =
    definition?.type === TSESLint.Scope.DefinitionType.Variable ? definition.parent : undefined;
  const loop = declaration?.parent;
  const direct =
    definition?.type === TSESLint.Scope.DefinitionType.Variable &&
    definition.node.id.type === AST_NODE_TYPES.Identifier;
  if (
    loop?.type !== AST_NODE_TYPES.ForOfStatement ||
    loop.left !== declaration ||
    !direct ||
    declaration.kind !== 'const'
  ) {
    return undefined;
  }
  return lookupValues(context, loop.right);
}

function identifierExpansion(context: Context, resolved: TSESTree.Identifier): Expansion {
  const elements = forOfElements(context, resolved);
  return elements === undefined
    ? { leaves: [resolved], next: writtenValues(context, resolved) }
    : { leaves: [], next: elements };
}

function callExpansion(resolved: TSESTree.CallExpression): Expansion {
  const { callee } = resolved;
  const preserving =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    TEXT_PRESERVING_METHODS.has(memberName(callee) ?? '');
  return preserving ? { leaves: [], next: [callee.object] } : { leaves: [resolved], next: [] };
}

function expansionOf(context: Context, resolved: TSESTree.Node): Expansion {
  if (resolved.type === AST_NODE_TYPES.ConditionalExpression) {
    return { leaves: [], next: [resolved.consequent, resolved.alternate] };
  }
  if (resolved.type === AST_NODE_TYPES.LogicalExpression) {
    return { leaves: [], next: [resolved.left, resolved.right] };
  }
  if (resolved.type === AST_NODE_TYPES.Identifier) {
    return identifierExpansion(context, resolved);
  }
  if (resolved.type === AST_NODE_TYPES.MemberExpression) {
    return memberExpansion(context, resolved);
  }
  if (resolved.type === AST_NODE_TYPES.CallExpression) {
    return callExpansion(resolved);
  }
  return { leaves: [resolved], next: [] };
}

export function leafValues(context: Context, node: MaybeNode): TSESTree.Node[] {
  const leaves: TSESTree.Node[] = [];
  const pending = [{ node, depth: 0 }];
  for (const item of pending) {
    const resolved = unwrapped(resolveConstant(context, unwrapped(item.node)));
    if (resolved === undefined || item.depth > MAX_DEPTH) {
      continue;
    }
    const expansion = expansionOf(context, resolved);
    leaves.push(...expansion.leaves);
    pending.push(...expansion.next.map((child) => ({ node: child, depth: item.depth + 1 })));
  }
  return leaves;
}
