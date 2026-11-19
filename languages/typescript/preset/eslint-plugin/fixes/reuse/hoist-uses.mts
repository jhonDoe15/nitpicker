import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { globalScopeOf } from '../edits/names.mts';
import { removingStatement, type FixPlan } from '../support/ranges.mts';
import { INTL_TYPES } from '../../rules/reuse/construction-kinds.mts';

export type Uses = { readonly sites: readonly TSESTree.Node[]; readonly removal?: FixPlan };

const FORMATTER_METHODS = new Set([
  'compare',
  'format',
  'formatRange',
  'formatRangeToParts',
  'formatToParts',
  'of',
  'resolvedOptions',
  'segment',
  'select',
  'selectRange',
]);

function isReadOnlyMember(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (
    parent?.type !== AST_NODE_TYPES.MemberExpression ||
    parent.object !== node ||
    parent.computed ||
    parent.property.type !== AST_NODE_TYPES.Identifier ||
    !FORMATTER_METHODS.has(parent.property.name)
  ) {
    return false;
  }
  const outer = parent.parent;
  return !(
    (outer.type === AST_NODE_TYPES.AssignmentExpression && outer.left === parent) ||
    outer.type === AST_NODE_TYPES.UpdateExpression ||
    (outer.type === AST_NODE_TYPES.UnaryExpression && outer.operator === 'delete')
  );
}

function localUses(
  sourceCode: SourceCode,
  declarator: TSESTree.VariableDeclarator,
): Uses | undefined {
  const declaration = declarator.parent;
  const [variable] = sourceCode.getDeclaredVariables(declarator);
  if (
    variable === undefined ||
    declaration.kind !== 'const' ||
    declaration.declarations.length !== 1 ||
    declaration.parent.type !== AST_NODE_TYPES.BlockStatement
  ) {
    return undefined;
  }
  const reads = variable.references.filter((reference) => reference.init !== true);
  const removal = removingStatement(sourceCode, declaration);
  const clean = reads.every(
    (reference) => !reference.isWrite() && isReadOnlyMember(reference.identifier),
  );
  return removal === undefined || reads.length === 0 || !clean
    ? undefined
    : { sites: reads.map((reference) => reference.identifier), removal };
}

export function usesOf(sourceCode: SourceCode, node: TSESTree.Node): Uses | undefined {
  const { parent } = node;
  if (isReadOnlyMember(node)) {
    return { sites: [node] };
  }
  const local =
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === node &&
    parent.id.type === AST_NODE_TYPES.Identifier;
  return local ? localUses(sourceCode, parent) : undefined;
}

function isConstructionHead(identifier: TSESTree.Identifier): boolean {
  const first = identifier.parent;
  const viaGlobal =
    identifier.name === 'globalThis' &&
    first.type === AST_NODE_TYPES.MemberExpression &&
    first.object === identifier &&
    !first.computed &&
    first.property.type === AST_NODE_TYPES.Identifier &&
    first.property.name === 'Intl';
  const owner = viaGlobal ? first : identifier;
  const member = owner.parent;
  return (
    (identifier.name === 'Intl' || viaGlobal) &&
    member.type === AST_NODE_TYPES.MemberExpression &&
    member.object === owner &&
    !member.computed &&
    member.property.type === AST_NODE_TYPES.Identifier &&
    INTL_TYPES.has(member.property.name) &&
    (member.parent.type === AST_NODE_TYPES.NewExpression ||
      member.parent.type === AST_NODE_TYPES.CallExpression) &&
    member.parent.callee === member
  );
}

function globalReferences(
  global: TSESLint.Scope.Scope,
  name: string,
): readonly TSESLint.Scope.Reference[] {
  return [
    ...(global.set.get(name)?.references ?? []),
    ...global.through.filter((reference) => reference.identifier.name === name),
  ];
}

export function intlOnlyConstructed(sourceCode: SourceCode): boolean {
  const global = globalScopeOf(sourceCode.getScope(sourceCode.ast));
  return ['Intl', 'globalThis'].every((name) =>
    globalReferences(global, name).every(
      ({ identifier, isValueReference }) =>
        !isValueReference ||
        (identifier.type === AST_NODE_TYPES.Identifier && isConstructionHead(identifier)),
    ),
  );
}
