import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../../analysis/constant-resolution.mts';
import { propertyKeyName } from '../../analysis/test-code-analysis.mts';
import { ASSERTION_FORMS, resolvedThrough } from '../../typed/syntax-views.mts';

type MaybeNode = TSESTree.Node | undefined;

export type OptionLookup =
  { readonly known: false } | { readonly known: true; readonly value: TSESTree.Node | undefined };

const UNKNOWN: OptionLookup = { known: false };
const IGNORED_OUTPUT = new Set(['ignore', 'inherit']);

function isNothing(node: MaybeNode): boolean {
  return (
    node === undefined ||
    (node.type === AST_NODE_TYPES.Literal && node.value === null) ||
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined')
  );
}

function lookupStep(
  property: TSESTree.ObjectLiteralElement,
  key: string,
  current: OptionLookup,
): OptionLookup {
  if (property.type === AST_NODE_TYPES.SpreadElement) {
    return UNKNOWN;
  }
  const name = propertyKeyName(property);
  if (name === key) {
    return { known: true, value: property.value };
  }
  return property.computed && name === undefined ? UNKNOWN : current;
}

export function optionValue(context: SourceContext, options: MaybeNode, key: string): OptionLookup {
  const resolved = resolvedThrough(context, options, ASSERTION_FORMS);
  if (isNothing(resolved)) {
    return { known: true, value: undefined };
  }
  if (resolved?.type !== AST_NODE_TYPES.ObjectExpression) {
    return UNKNOWN;
  }
  const found: { value: OptionLookup } = { value: { known: true, value: undefined } };
  for (const property of resolved.properties) {
    found.value = lookupStep(property, key, found.value);
  }
  return found.value;
}

function literalText(context: SourceContext, node: MaybeNode): string | undefined {
  const value = resolveConstant(context, node);
  return value?.type === AST_NODE_TYPES.Literal && typeof value.value === 'string'
    ? value.value
    : undefined;
}

export function outputIgnored(context: SourceContext, options: MaybeNode): boolean {
  const stdio = optionValue(context, options, 'stdio');
  if (!stdio.known) {
    return true;
  }
  const value = resolveConstant(context, stdio.value);
  if (value?.type === AST_NODE_TYPES.ArrayExpression) {
    const out = value.elements[1];
    return out !== undefined && out !== null && literalText(context, out) !== 'pipe';
  }
  if (value === undefined) {
    return false;
  }
  const text = literalText(context, value);
  return text === undefined || IGNORED_OUTPUT.has(text);
}

export function literalOption(context: SourceContext, options: MaybeNode, key: string): unknown {
  const lookup = optionValue(context, options, key);
  const value = lookup.known ? resolveConstant(context, lookup.value) : undefined;
  return value?.type === AST_NODE_TYPES.Literal ? value.value : undefined;
}
