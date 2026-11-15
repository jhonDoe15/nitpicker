import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  initializer as untypedInitializer,
  isUnresolved as untypedIsUnresolved,
  libraryBinding as untypedLibraryBinding,
  variableOf as untypedVariableOf,
} from '../../../../libraries/module-bindings.mjs';
import { VALIDATION_LIBRARIES as untypedValidationLibraries } from '../../../../libraries/validation-libraries.mjs';
import { isNode, type SourceCode } from '../../typed/node-views.mts';

type Variable = TSESLint.Scope.Variable;
export type LibraryBinding = { readonly source: string; readonly name: string | undefined };
type ValidationLibrary = { readonly id: string; readonly packages: readonly string[] };

export const variableOf: (
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
) => Variable | undefined = untypedVariableOf;

export const libraryBinding: (
  variable: Variable | undefined,
  packages: readonly string[],
) => LibraryBinding | undefined = untypedLibraryBinding;

export const isUnresolved: (variable: Variable | undefined) => boolean = untypedIsUnresolved;

export const VALIDATION_LIBRARIES: readonly ValidationLibrary[] = untypedValidationLibraries;

export function initializerOf(variable: Variable | undefined): TSESTree.Node | undefined {
  const init: unknown = untypedInitializer(variable);
  return isNode(init) ? init : undefined;
}
