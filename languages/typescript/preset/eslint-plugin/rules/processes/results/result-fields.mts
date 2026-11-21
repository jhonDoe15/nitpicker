import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import { nameOf } from '../../typed/node-views.mts';
import { outerValue } from '../messages/text-base.mts';

export type FieldUse = { readonly field: string; readonly node: TSESTree.Node };

function memberField(node: TSESTree.Node): FieldUse | undefined {
  const { parent } = node;
  if (parent?.type !== AST_NODE_TYPES.MemberExpression || parent.object !== node) {
    return undefined;
  }
  const field = parent.computed ? undefined : nameOf(parent.property);
  return field === undefined ? undefined : { field, node: outerValue(parent) };
}

function readsOf(context: SourceContext, id: TSESTree.Identifier): TSESTree.Node[] {
  return (
    findVariable(context, id, id.name)
      ?.references.filter((reference) => reference.isRead())
      .map((reference) => outerValue(reference.identifier)) ?? []
  );
}

function patternFields(
  context: SourceContext,
  pattern: TSESTree.ObjectPattern,
): FieldUse[] | undefined {
  const uses: FieldUse[] = [];
  for (const property of pattern.properties) {
    const field = property.type === AST_NODE_TYPES.Property ? nameOf(property.key) : undefined;
    if (property.type !== AST_NODE_TYPES.Property || property.computed || field === undefined) {
      return undefined;
    }
    const target =
      property.value.type === AST_NODE_TYPES.AssignmentPattern
        ? property.value.left
        : property.value;
    const reads = target.type === AST_NODE_TYPES.Identifier ? readsOf(context, target) : [];
    uses.push({ field, node: property });
    for (const node of reads) {
      uses.push({ field, node });
    }
  }
  return uses;
}

export function resultFieldUses(
  context: SourceContext,
  call: TSESTree.Node,
): FieldUse[] | undefined {
  const value = outerValue(call);
  const direct = memberField(value);
  if (direct !== undefined) {
    return [direct];
  }
  const { parent } = value;
  if (parent?.type !== AST_NODE_TYPES.VariableDeclarator || parent.init !== value) {
    return undefined;
  }
  if (parent.id.type === AST_NODE_TYPES.ObjectPattern) {
    return patternFields(context, parent.id);
  }
  if (parent.id.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const fields = readsOf(context, parent.id).map(memberField);
  return fields.every((use) => use !== undefined) ? fields : undefined;
}
