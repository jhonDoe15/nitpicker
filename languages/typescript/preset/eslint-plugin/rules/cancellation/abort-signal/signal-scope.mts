import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { partsOf } from '../../analysis/narrowing/type-parts.mts';
import { scopeChain } from '../../typed/node-views.mts';

const { DefinitionType, ScopeType } = TSESLint.Scope;

export type Signals = {
  readonly checker: TypeScript.TypeChecker | undefined;
  readonly typeOf: (node: TSESTree.Node) => TypeScript.Type;
};

const UNTYPED_NAMES = new Set<string>(['signal', 'abortSignal']);

export function isSignalType(type: TypeScript.Type): boolean {
  return partsOf(type).some(
    (part) => (part.getSymbol() ?? part.aliasSymbol)?.getName() === 'AbortSignal',
  );
}

function isSignalVariable(variable: TSESLint.Scope.Variable, signals: Signals): boolean {
  const definition = variable.defs[0];
  if (definition === undefined || definition.name.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  if (signals.checker !== undefined) {
    return isSignalType(signals.typeOf(definition.name));
  }
  return (
    definition.type === DefinitionType.Parameter &&
    UNTYPED_NAMES.has(variable.name) &&
    definition.name.typeAnnotation === undefined
  );
}

export function signalsInScope(
  scope: TSESLint.Scope.Scope,
  signals: Signals,
): readonly TSESLint.Scope.Variable[] {
  return scopeChain(scope)
    .filter((current) => current.type !== ScopeType.global && current.type !== ScopeType.module)
    .flatMap((current) =>
      current.variables.filter((variable) => isSignalVariable(variable, signals)),
    );
}
