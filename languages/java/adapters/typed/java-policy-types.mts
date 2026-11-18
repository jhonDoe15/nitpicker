import { parseRunnerArguments } from '../../../../core/tooling/runner-arguments.mjs';
import { canonicalRule } from '../../../../shared/exceptions/rule-names.mjs';
import { sharedRouteRule } from '../../../../shared/exceptions/routes.mjs';
import { withLegacyInventory } from '../../../../shared/legacy-inventory.mjs';
import { fieldOf, fieldsOf } from '../../../../shared/values/readers.mts';
import { declaredToolDigest } from '../tool-config/declared/declared-choices.mjs';
import { callUntyped, javaPolicyOf, type JavaFinding, type JavaPolicy } from './java-values.mts';

export type ToolSettings = Readonly<
  Record<string, { readonly precedence: readonly string[] } | undefined>
>;

export type InvocationContext = {
  readonly projectRoot: string;
  readonly toolRoot: string;
  readonly mutationScope?: unknown;
  readonly snapshot?: string | undefined;
  readonly projectPolicyRoot?: string | undefined;
  readonly baselineRoot?: string | undefined;
  readonly logRoot?: string | undefined;
  readonly logLabel?: string | undefined;
  readonly baselineMovesFile?: string | undefined;
};

type Invocation = { readonly args: readonly string[]; readonly [field: string]: unknown };

export type JavaAnalyzer = {
  readonly name: string;
  readonly configurationHash: string;
  readonly createInvocation: (context: InvocationContext) => Invocation;
  readonly resolveConfigurationHash?: (policyRoot: string) => string;
  readonly [field: string]: unknown;
};

type ExceptionEntry = {
  readonly rule: unknown;
  readonly paths: unknown;
  readonly function?: unknown;
  readonly [field: string]: unknown;
};

export type RunnerConfig = {
  readonly thresholds?: Readonly<Record<string, unknown>> | undefined;
  readonly exclude?: readonly string[] | undefined;
  readonly exceptions?: readonly ExceptionEntry[] | undefined;
  readonly kotlin?: { readonly formatter?: string; readonly detektConfig?: string } | undefined;
  readonly java?:
    { readonly buildTool?: string; readonly analyzeGeneratedSources: boolean } | undefined;
  readonly mutationOff?: true | false;
  readonly duplicates?: { readonly skippedFolders?: unknown } | undefined;
  readonly tools?: ToolSettings | undefined;
  readonly testConsole?: { readonly allow?: unknown } | undefined;
};

export type ConfigureOptions = RunnerConfig & {
  readonly legacyInventory?: string | undefined;
  readonly styleFiles?: ((policyRoot: string) => string[]) | undefined;
};

export type JavaConfig = {
  readonly preset?: string | undefined;
  readonly exceptions?: unknown;
  readonly thresholds?: Readonly<Record<string, unknown>> | undefined;
  readonly [key: string]: unknown;
};

export type ParsedArguments = {
  readonly policy: JavaPolicy;
  readonly [field: string]: unknown;
};

export function parseArguments(
  argumentList: readonly string[],
  spec: {
    runner: string;
    choices: Record<string, readonly string[]>;
    precedenceTools: string[];
  },
): ParsedArguments {
  const parsed = callUntyped(parseRunnerArguments, argumentList, spec);
  return { ...fieldsOf(parsed), policy: javaPolicyOf(fieldOf(parsed, 'policy')) };
}
export const withInventory: (analyzer: JavaAnalyzer, legacyInventory: string) => JavaAnalyzer =
  withLegacyInventory;
export const canonical: (rule: string) => string = canonicalRule;
export const toolDigest: (
  declared: Record<string, readonly string[] | undefined>,
  policyRoot: string,
) => string = declaredToolDigest;
export const routeRuleOf: (finding: JavaFinding) => string = sharedRouteRule;

export const FILE_LIMIT_THRESHOLDS: readonly string[] = [
  'fileLines',
  'testFileLines',
  'lineLength',
  'folderFiles',
  'folderDepth',
  'classMethods',
  'classFields',
  'inheritanceDepth',
];
export const TEST_TIME_THRESHOLDS: readonly string[] = [
  'unitTestSeconds',
  'integrationTestSeconds',
];
