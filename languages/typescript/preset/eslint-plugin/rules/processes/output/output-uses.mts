import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import { chainOf, nameOf } from '../../typed/node-views.mts';
import { outerText, outerValue } from '../messages/text-base.mts';

const OUTPUT_MEMBERS = new Set(['stdout', 'output', 'all']);
export type OutputShape = 'text' | 'result';

function memberOf(node: TSESTree.Node): string | undefined {
  const { parent } = node;
  return parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === node
    ? nameOf(parent.property)
    : undefined;
}

function isJsonParseArgument(node: TSESTree.Node): boolean {
  const { parent } = node;
  return (
    parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === node &&
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(parent.callee.object) === 'JSON' &&
    nameOf(parent.callee.property) === 'parse'
  );
}

const MAX_USES = 64;

export function textParsedWhole(context: SourceContext, start: TSESTree.Node): boolean {
  const pending = [start];
  for (const node of pending) {
    const text = chainOf(node, outerText).at(-1) ?? node;
    if (isJsonParseArgument(text) || memberOf(text) === 'split') {
      return true;
    }
    const room = Math.max(0, MAX_USES - pending.length);
    for (const use of (heldUses(context, text) ?? []).slice(0, room)) {
      pending.push(use);
    }
  }
  return false;
}

function declaredName(node: TSESTree.Node): TSESTree.Identifier | undefined {
  const { parent } = node;
  return parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === node &&
    parent.id.type === AST_NODE_TYPES.Identifier
    ? parent.id
    : undefined;
}

function heldUses(context: SourceContext, node: TSESTree.Node): TSESTree.Node[] | undefined {
  const id = declaredName(node);
  if (id === undefined) {
    return undefined;
  }
  const variable = findVariable(context, id, id.name);
  return variable?.references
    .filter((reference) => reference.isRead())
    .map((reference) => outerValue(reference.identifier));
}

function destructuredOutputs(
  context: SourceContext,
  node: TSESTree.Node,
): TSESTree.Node[] | undefined {
  const { parent } = node;
  if (
    parent?.type !== AST_NODE_TYPES.VariableDeclarator ||
    parent.id.type !== AST_NODE_TYPES.ObjectPattern
  ) {
    return undefined;
  }
  const names = parent.id.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.Property &&
    OUTPUT_MEMBERS.has(nameOf(property.key) ?? '') &&
    property.value.type === AST_NODE_TYPES.Identifier
      ? [property.value]
      : [],
  );
  return names.flatMap(
    (id) =>
      findVariable(context, id, id.name)
        ?.references.filter((reference) => reference.isRead())
        .map((reference) => outerValue(reference.identifier)) ?? [],
  );
}

function resultOutputs(context: SourceContext, value: TSESTree.Node): TSESTree.Node[] {
  const direct = OUTPUT_MEMBERS.has(memberOf(value) ?? '')
    ? [outerValue(value.parent ?? value)]
    : [];
  const held = (heldUses(context, value) ?? []).flatMap((use) =>
    OUTPUT_MEMBERS.has(memberOf(use) ?? '') ? [outerValue(use.parent ?? use)] : [],
  );
  return [...direct, ...held];
}

export function outputReads(
  context: SourceContext,
  call: TSESTree.Node,
  shape: OutputShape,
): { readonly read: boolean; readonly parsed: boolean } {
  const value = outerValue(call);
  if (value.parent?.type === AST_NODE_TYPES.ExpressionStatement) {
    return { read: false, parsed: false };
  }
  if (shape === 'text') {
    return { read: true, parsed: textParsedWhole(context, value) };
  }
  const destructured = destructuredOutputs(context, value);
  const outputs = destructured ?? resultOutputs(context, value);
  return {
    read: outputs.length > 0,
    parsed: outputs.some((output) => textParsedWhole(context, output)),
  };
}
