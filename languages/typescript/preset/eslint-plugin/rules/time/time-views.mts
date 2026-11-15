import type {
  ParserServicesWithTypeInformation,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { initializer as untypedInitializer } from '../../../libraries/module-bindings.mjs';
export type { LibraryBinding } from '../boundaries/schema-fields/library-bindings.mts';

type Variable = TSESLint.Scope.Variable;

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

export { libraryBinding, variableOf } from '../boundaries/schema-fields/library-bindings.mts';

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
