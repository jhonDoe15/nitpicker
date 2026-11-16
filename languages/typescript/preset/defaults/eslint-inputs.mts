import type { ESLint, Linter } from 'eslint';
import type { Layout } from '../../adapters/typed/head-policy.mts';
import { nitpickerRules as untypedNitpickerRules } from '../eslint-plugin/index.mts';
import { errorWrappingPolicy as untypedErrorWrappingPolicy } from '../eslint-config/policies/error-wrapping-policy.mts';
import { strictPresetConfig as untypedStrictPresetConfig } from '../eslint-config/strict.mts';
import {
  UNUSED_PARAMETERS as untypedUnusedParameters,
  usesRouteHandlerFramework as untypedUsesRouteHandlerFramework,
  productionLayoutConfigFor as untypedProductionLayoutConfigFor,
} from '../eslint-config/policy/production-policy.mts';
import { applyRuleExceptions as untypedApplyRuleExceptions } from '../eslint-config/exceptions.mjs';
import { logicConfigFor as untypedLogicConfigFor } from '../eslint-config/logic/logic-rules.mts';
import { untypedJavascriptConfig as javascriptWithoutTypesConfig } from '../eslint-config/policy/untyped-javascript.mts';
import {
  applyJavascriptDialect as untypedApplyJavascriptDialect,
  scriptRuleEntries as untypedScriptRuleEntries,
} from '../../../javascript/preset/eslint-dialect.mts';
import {
  reactRuleIds as untypedReactRuleIds,
  reactTestRuleIds as untypedReactTestRuleIds,
} from '../eslint-config/react/react-rules.mjs';
import {
  analyzedProjectRoot as untypedAnalyzedProjectRoot,
  isReactProject as untypedIsReactProject,
  reactScopeConfigFor as untypedReactScopeConfigFor,
} from '../eslint-config/react/react-scope.mts';
import { testHonestyConfigFor as untypedTestHonestyConfigFor } from '../eslint-config/test-honesty/index.mts';
import { setupFilesIn as untypedSetupFilesIn } from '../eslint-config/test-honesty/setup-files.mts';
import { stubRestoresIn as untypedStubRestoresIn } from '../eslint-config/test-honesty/stub-restores.mts';
import { readDependencyNames as untypedReadDependencyNames } from '../eslint-config/scope-support.mjs';
import { securityFactsFor as untypedSecurityFactsFor } from '../eslint-config/policy/security-facts.mts';
import { i18nRuleIds as untypedI18nRuleIds } from '../eslint-config/i18n/i18n-rules.mjs';
import {
  i18nScopeConfigFor as untypedI18nScopeConfigFor,
  isI18nProject as untypedIsI18nProject,
} from '../eslint-config/i18n/i18n-scope.mts';
import {
  isServerProject as untypedIsServerProject,
  serverScopeConfigFor as untypedServerScopeConfigFor,
} from '../eslint-config/server/server-scope.mts';
import { serverRuleIds as untypedServerRuleIds } from '../eslint-config/server/server-rules.mts';
import { isNestProject as untypedIsNestProject } from '../eslint-config/nest/nest-project.mjs';
import { nestScopeConfigFor as untypedNestScopeConfigFor } from '../eslint-config/nest/nest-scope.mts';
import {
  readHeadPolicy as untypedReadHeadPolicy,
  readLayout as untypedReadLayout,
} from '../head-policy.mjs';
import { precedenceLayers as untypedPrecedenceLayers } from '../../../../shared/conventions/tool-precedence.mjs';
import { existingRoots as untypedExistingRoots } from '../layout.mjs';
import { fileNameRuleOptions as untypedFileNameRuleOptions } from '../../conventions/file-name-casing.mjs';
import { assertionFunctionNames as untypedAssertionFunctionNames } from '../../conventions/measures/assertion-functions.mts';
import { typeImportFixStyle as untypedTypeImportFixStyle } from '../../conventions/type-import-style.mts';
import { detachedWorkRunnerNames as untypedDetachedWorkRunnerNames } from '../../conventions/measures/detached-work-runners.mts';
import { routeAuthEntries as untypedRouteAuthEntries } from '../../conventions/measures/routes/route-auth.mts';
import { softDeleteFilterEntries as untypedSoftDeleteFilterEntries } from '../../conventions/measures/database/soft-delete-filters.mts';
import { projectOpensTransactions as untypedProjectOpensTransactions } from '../../conventions/measures/database/transactions.mts';
import { ormsOf as untypedOrmsOf } from '../eslint-plugin/rules/support/orm/orms.mts';
import {
  testEnvironmentConfigFor as untypedTestEnvironmentConfigFor,
  testEnvironmentsFromVariables as untypedTestEnvironmentsFromVariables,
} from '../test-environment/test-environment-config.mts';
import type { Environments } from '../test-environment/typed/environment-types.mts';

export type Entry = Linter.Config;

type Plugin = ESLint.Plugin;

export type StrictOptions = {
  readonly react: boolean;
  readonly nest: boolean;
  readonly routeHandlers: boolean;
  readonly security: SecurityFacts;
  readonly frameworkDefaultExports: readonly string[];
  readonly detachedWorkRunners: readonly string[];
  readonly databaseWrites: {
    readonly orms: readonly string[];
    readonly opensTransactions: boolean;
  };
  readonly routeAuth: { readonly entries: readonly string[] };
  readonly softDeleteFilters: {
    readonly orms: readonly string[];
    readonly filters: readonly string[];
  };
};

export type PresetLayout = Layout & {
  readonly testGlobs: readonly string[];
  readonly unitTestGlobs: readonly string[];
  readonly endToEndGlobs: readonly string[];
  readonly typescriptProject?: string | undefined;
};

export type ParserOptions = {
  readonly project: string;
  readonly tsconfigRootDir: string;
};

type Conventions = object;

type SecurityFacts = { readonly browser: boolean };

type TestEnvironments = Environments;

export type PresetPolicy = {
  readonly react: object;
  readonly i18n: object;
  readonly conventions: Conventions;
  readonly frameworks: { readonly defaultExports: readonly string[] };
  readonly exceptions: { readonly rule: string; readonly paths: string[] }[];
  readonly tools: { readonly eslint?: { readonly precedence?: string[] } };
};

function isEntries(value: unknown): value is Entry[] {
  return Array.isArray(value);
}

function entriesOf(value: unknown): Entry[] {
  if (!isEntries(value)) {
    throw new TypeError('ESLint policy entries must be an array');
  }
  return value;
}

function isPlugin(value: unknown): value is Plugin {
  return typeof value === 'object' && value !== null && 'rules' in value;
}

function pluginOf(value: unknown): Plugin {
  if (!isPlugin(value)) {
    throw new TypeError('The nitpicker ESLint plugin does not load');
  }
  return value;
}

export const nitpickerRules: Plugin = pluginOf(untypedNitpickerRules);
export const errorWrappingPolicy: unknown = untypedErrorWrappingPolicy;
export const UNUSED_PARAMETERS: unknown = untypedUnusedParameters;
export const readHeadPolicy: () => PresetPolicy = untypedReadHeadPolicy;
export const readLayout: () => PresetLayout = untypedReadLayout;
export const reactRuleIds: readonly string[] = untypedReactRuleIds;
export const reactTestRuleIds: readonly string[] = untypedReactTestRuleIds;
export const i18nRuleIds: readonly string[] = untypedI18nRuleIds;
export const serverRuleIds: readonly string[] = untypedServerRuleIds;
export const analyzedProjectRoot: () => string = untypedAnalyzedProjectRoot;
export const usesRouteHandlerFramework: (dependencyNames: readonly string[]) => boolean =
  untypedUsesRouteHandlerFramework;
export const readDependencyNames: (projectRoot: string) => string[] = untypedReadDependencyNames;
export const isReactProject: (options: {
  readonly projectRoot: string;
  readonly react: object;
  readonly javascript: boolean;
}) => boolean = untypedIsReactProject;
export const isI18nProject: (options: {
  readonly projectRoot: string;
  readonly i18n: object;
  readonly javascript: boolean;
}) => boolean = untypedIsI18nProject;
export const isServerProject: (projectRoot: string) => boolean = untypedIsServerProject;
export const isNestProject: (projectRoot: string) => boolean = untypedIsNestProject;
export const securityFactsFor: (
  projectRoot: string,
  isProductionFile: (file: string) => boolean,
) => SecurityFacts = untypedSecurityFactsFor;
export const setupFilesIn: (projectRoot: string) => string[] = untypedSetupFilesIn;
export const stubRestoresIn: (projectRoot: string) => unknown[] = untypedStubRestoresIn;
export const existingRoots: (projectRoot: string, roots: readonly string[]) => string[] =
  untypedExistingRoots;
export const testEnvironmentsFromVariables: (variables: NodeJS.ProcessEnv) => TestEnvironments =
  untypedTestEnvironmentsFromVariables;
export const fileNameRuleOptions: (policy: PresetPolicy) => unknown = untypedFileNameRuleOptions;
export const typeImportFixStyle: (conventions: Conventions) => unknown = untypedTypeImportFixStyle;
export const assertionFunctionNames: (conventions: Conventions) => string[] =
  untypedAssertionFunctionNames;
export const detachedWorkRunnerNames: (conventions: Conventions) => string[] =
  untypedDetachedWorkRunnerNames;
export const routeAuthEntries: (conventions: Conventions) => string[] = untypedRouteAuthEntries;
export const softDeleteFilterEntries: (conventions: Conventions) => string[] =
  untypedSoftDeleteFilterEntries;
export const projectOpensTransactions: (conventions: Conventions) => boolean =
  untypedProjectOpensTransactions;
export const ormsOf: (dependencies: readonly string[]) => string[] = untypedOrmsOf;
export const precedenceLayers: (precedence: string[] | undefined) => {
  readonly usesProject: boolean;
} = untypedPrecedenceLayers;

export function strictPresetConfig(
  layout: PresetLayout,
  parserOptions: ParserOptions,
  options: StrictOptions,
): Entry[] {
  return entriesOf(
    Reflect.apply(untypedStrictPresetConfig, undefined, [layout, parserOptions, options]),
  );
}

export function productionLayoutConfigFor(
  layout: PresetLayout,
  options: { readonly react: boolean },
): Entry[] {
  return entriesOf(untypedProductionLayoutConfigFor(layout, options));
}

export function logicConfigFor(files: readonly string[], parserOptions: ParserOptions): Entry[] {
  return entriesOf(untypedLogicConfigFor([...files], parserOptions));
}

export function untypedJavascriptConfig(options: {
  readonly tsconfigFile: string;
  readonly projectRoot: string;
  readonly layout: PresetLayout;
}): Entry[] {
  return entriesOf(Reflect.apply(javascriptWithoutTypesConfig, undefined, [options]));
}

export async function reactScopeConfigFor(layout: PresetLayout, react: object): Promise<Entry[]> {
  const entries: unknown = await Reflect.apply(untypedReactScopeConfigFor, undefined, [
    layout,
    react,
  ]);
  return entriesOf(entries);
}

export async function i18nScopeConfigFor(layout: PresetLayout, i18n: object): Promise<Entry[]> {
  const entries: unknown = await Reflect.apply(untypedI18nScopeConfigFor, undefined, [
    layout,
    i18n,
  ]);
  return entriesOf(entries);
}

export function serverScopeConfigFor(
  layout: PresetLayout,
  options: { readonly browser: boolean },
): Entry[] {
  return entriesOf(Reflect.apply(untypedServerScopeConfigFor, undefined, [layout, options]));
}

export function nestScopeConfigFor(files: readonly string[]): Entry[] {
  return entriesOf(untypedNestScopeConfigFor([...files]));
}

export function testHonestyConfigFor(
  layout: PresetLayout,
  options: {
    readonly assertionFunctionNames: readonly string[];
    readonly setupFiles: readonly string[];
    readonly stubRestores: readonly unknown[];
    readonly testRootsOnDisk: readonly string[];
  },
): Entry[] {
  return entriesOf(Reflect.apply(untypedTestHonestyConfigFor, undefined, [layout, options]));
}

export function testEnvironmentConfigFor(
  layout: PresetLayout,
  environments: TestEnvironments,
): Entry[] {
  return entriesOf(
    Reflect.apply(untypedTestEnvironmentConfigFor, undefined, [layout, environments]),
  );
}

export function applyJavascriptDialect(entries: Entry[], policy: PresetPolicy): Entry[] {
  return entriesOf(untypedApplyJavascriptDialect(entries, policy));
}

export function scriptRuleEntries(files: readonly string[]): Entry[] {
  return entriesOf(untypedScriptRuleEntries(files));
}

export function applyRuleExceptions(
  entries: Entry[],
  exceptions: PresetPolicy['exceptions'],
  options: { readonly projectRules: boolean },
): Entry[] {
  return entriesOf(untypedApplyRuleExceptions(entries, exceptions, options));
}
