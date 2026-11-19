import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  initializer as untypedInitializer,
  libraryBinding as untypedLibraryBinding,
  variableOf as untypedVariableOf,
} from '../../../libraries/module-bindings.mts';
import { stringSourceBinding, type LibraryBinding, type SourceCode } from '../typed/node-views.mts';

export type { LibraryBinding };

export const variableOf: (
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
) => TSESLint.Scope.Variable | undefined = untypedVariableOf;
export function libraryBinding(
  variable: TSESLint.Scope.Variable | undefined,
  packages: readonly string[],
): LibraryBinding | undefined {
  return stringSourceBinding(untypedLibraryBinding(variable, packages));
}
export const initializer: (
  variable: TSESLint.Scope.Variable | undefined,
) => TSESTree.Expression | undefined = untypedInitializer;
