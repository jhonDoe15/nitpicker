import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

type NodeOfKind<Kind extends string> = TSESTree.Node extends infer Candidate
  ? Candidate extends { readonly type: infer Type extends string }
    ? `${Type}` extends Kind
      ? Candidate
      : never
    : never
  : never;

type MaybeNode =
  | TSESTree.Node
  | TSESTree.ExportNamedDeclaration['declaration']
  | TSESTree.JSXAttribute['value']
  | undefined;

type NodeKind = TSESTree.Node['type'];

export function hasKind<Kind extends `${NodeKind}`>(
  node: MaybeNode,
  kind: Kind,
): node is NodeOfKind<Kind> {
  if (node === undefined || node === null) {
    return false;
  }
  const type: string = node.type;
  return type === kind;
}

export function isVariableDefinition(
  definition: TSESLint.Scope.Definition | undefined,
): definition is TSESLint.Scope.Definitions.VariableDefinition {
  if (definition === undefined) {
    return false;
  }
  const type: string = definition.type;
  return type === 'Variable';
}

type DefinitionOfKind<Kind extends string> = TSESLint.Scope.Definition extends infer Candidate
  ? Candidate extends { readonly type: infer Type extends string }
    ? `${Type}` extends Kind
      ? Candidate
      : never
    : never
  : never;

type DefinitionKind = TSESLint.Scope.Definition['type'];

export function hasDefinitionKind<Kind extends `${DefinitionKind}`>(
  definition: TSESLint.Scope.Definition | undefined,
  kind: Kind,
): definition is DefinitionOfKind<Kind> {
  if (definition === undefined) {
    return false;
  }
  const type: string = definition.type;
  return type === kind;
}
