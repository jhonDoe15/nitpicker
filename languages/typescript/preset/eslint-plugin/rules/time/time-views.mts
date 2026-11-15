import type {
  ParserServicesWithTypeInformation,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import {
  initializer as untypedInitializer,
  libraryBinding as untypedLibraryBinding,
  variableOf as untypedVariableOf,
} from '../../../libraries/module-bindings.mjs';
import type { SourceCode } from '../typed/node-views.mts';

type Variable = TSESLint.Scope.Variable;

export type LibraryBinding = { readonly source: string; readonly name: string | undefined };

export type TimeMessageId =
  | 'localDateMethod'
  | 'localOffset'
  | 'localString'
  | 'localeWithoutZone'
  | 'intlWithoutZone'
  | 'serverZoneName'
  | 'localConstructor'
  | 'localParse'
  | 'luxonLocal'
  | 'dateFnsLocal'
  | 'dayjsLocal';

export type Problem = {
  readonly messageId: TimeMessageId;
  readonly data: Readonly<Record<string, unknown>>;
};

export const variableOf: (
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
) => Variable | undefined = untypedVariableOf;

export const libraryBinding: (
  variable: Variable | undefined,
  packages: readonly string[],
) => LibraryBinding | undefined = untypedLibraryBinding;

const declaredInitializer: (
  variable: Variable | undefined,
) => TSESTree.VariableDeclarator['init'] | undefined = untypedInitializer;

export function initializer(variable: Variable | undefined): TSESTree.Expression | undefined {
  return declaredInitializer(variable) ?? undefined;
}

export function hasTypeInformation(
  services: TSESLint.SourceCode['parserServices'],
): services is ParserServicesWithTypeInformation {
  return (
    services?.program !== null &&
    services?.program !== undefined &&
    services.esTreeNodeToTSNodeMap !== undefined
  );
}
