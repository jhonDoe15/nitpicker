import { TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { scopeChain, type SourceCode } from '../../rules/typed/node-views.mts';

const { DefinitionType } = TSESLint.Scope;

export function visibleVariable(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  name: string,
): TSESLint.Scope.Variable | undefined {
  return scopeChain(sourceCode.getScope(node))
    .map((scope) => scope.set.get(name))
    .find((variable) => variable !== undefined);
}

export function isDeclared(sourceCode: SourceCode, node: TSESTree.Node, name: string): boolean {
  return (visibleVariable(sourceCode, node, name)?.defs.length ?? 0) > 0;
}

export function isImportedName(sourceCode: SourceCode, node: TSESTree.Node, name: string): boolean {
  const variable = visibleVariable(sourceCode, node, name);
  return (
    variable !== undefined &&
    variable.defs.every(({ type }) => type === DefinitionType.ImportBinding)
  );
}
