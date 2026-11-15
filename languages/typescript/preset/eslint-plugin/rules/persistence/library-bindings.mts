import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  initializer as untypedInitializer,
  libraryBinding as untypedLibraryBinding,
  variableOf as untypedVariableOf,
} from '../../../libraries/module-bindings.mjs';
import type { SourceCode } from '../typed/node-views.mts';

export type LibraryBinding = { readonly source: string; readonly name: string | undefined };

export const variableOf: (
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
) => TSESLint.Scope.Variable | undefined = untypedVariableOf;
export const libraryBinding: (
  variable: TSESLint.Scope.Variable | undefined,
  packages: readonly string[],
) => LibraryBinding | undefined = untypedLibraryBinding;
export const initializer: (
  variable: TSESLint.Scope.Variable | undefined,
) => TSESTree.Expression | undefined = untypedInitializer;
