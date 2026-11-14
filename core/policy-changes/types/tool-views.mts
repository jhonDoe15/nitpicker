import {
  BUILD_DECLARED_TOOLS as UNTYPED_BUILD_DECLARED_TOOLS,
  PROJECT_TOOL_CONFIGS as UNTYPED_PROJECT_TOOL_CONFIGS,
} from '../../../languages/java/adapters/gradle-presets.mjs';
import { declaredConfigFiles as untypedDeclaredConfigFiles } from '../../../languages/java/adapters/tool-config/declared/declared-choices.mjs';
import {
  readInside as untypedReadInside,
  readRealInside as untypedReadRealInside,
} from '../../../shared/conventions/read-inside.mjs';
import {
  JSCPD_PROJECT_FILE as UNTYPED_JSCPD_PROJECT_FILE,
  precedenceLayers as untypedPrecedenceLayers,
} from '../../../shared/conventions/tool-precedence.mjs';
import { kotlinStyleFiles as untypedKotlinStyleFiles } from '../../../languages/java/adapters/kotlin/kotlin-tools.mjs';
import { PRETTIER_PROJECT_FILES as UNTYPED_PRETTIER_PROJECT_FILES } from '../../../languages/typescript/preset/head-policy.mjs';
import {
  appliedStrykerConfig as untypedAppliedStrykerConfig,
  STRYKER_PROJECT_FILES as UNTYPED_STRYKER_PROJECT_FILES,
} from '../../../languages/typescript/preset/project-configs/stryker-project-config.mjs';
import {
  appliedTypescriptOptions as untypedAppliedTypescriptOptions,
  projectTsconfigFiles as untypedProjectTsconfigFiles,
} from '../../../languages/typescript/preset/project-configs/typescript/typescript-project-options.mjs';
import {
  appliedRunnerRetry as untypedAppliedRunnerRetry,
  TESTS_TOOL as UNTYPED_TESTS_TOOL,
  testRunnerProjectFiles as untypedTestRunnerProjectFiles,
} from '../../../languages/typescript/preset/project-configs/test-runner/test-runner-config.mjs';
import {
  isProjectConfigTool as untypedIsProjectConfigTool,
  manifestSection as untypedManifestSection,
  packageJsonKey as untypedPackageJsonKey,
  projectConfigCandidates as untypedProjectConfigCandidates,
  projectConfigTools as untypedProjectConfigTools,
} from '../../../languages/typescript/preset/project-tools/project-config-files.mjs';
import {
  appliedProjectConfigs as untypedAppliedProjectConfigs,
  hasProjectConfigChanges as untypedHasProjectConfigChanges,
  projectConfigChanges as untypedProjectConfigChanges,
} from '../../../languages/typescript/preset/project-tools/changes/project-config-changes.mjs';
import {
  eslintConfigFiles as untypedEslintConfigFiles,
  readEslintConfigFile as untypedReadEslintConfigFile,
} from '../../../languages/typescript/preset/eslint-project/project-config.mjs';
import { replacedEslintOptions as untypedReplacedEslintOptions } from '../../../languages/typescript/adapters/lint-engine/replaced-options.mjs';
import { strykerConfigChanges as untypedStrykerConfigChanges } from '../../../languages/typescript/preset/project-configs/stryker-config-changes.mjs';
import { testsConfigChanges as untypedTestsConfigChanges } from '../build-files/applied-values/retry-changes.mjs';
import { typescriptConfigChanges as untypedTypescriptConfigChanges } from '../../../languages/typescript/preset/project-configs/typescript/typescript-config-changes.mjs';
import { jscpdConfigChanges as untypedJscpdConfigChanges } from '../../tooling/jscpd/changes/config-changes.mts';
import { appliedJscpdConfig as untypedAppliedJscpdConfig } from '../../tooling/jscpd/config.mjs';
import { readImportLinterConfig as untypedReadImportLinterConfig } from '../../../languages/python/adapters/analysis/import-linter/import-linter-config.mjs';
import { attempt as untypedAttempt } from '../../../languages/python/adapters/project-tools/project-tool-layers.mjs';
import { readPytestRetries as untypedReadPytestRetries } from '../../../languages/python/adapters/test-runs/retries/pytest-retries.mjs';
import {
  directorySource as untypedDirectorySource,
  readDeclaredBuild as untypedReadDeclaredBuild,
} from '../../../languages/java/adapters/tool-config/declared/declared-build.mjs';
import {
  testRetryDeclarations as untypedTestRetryDeclarations,
  testRetryValues as untypedTestRetryValues,
} from '../../../languages/java/adapters/tool-config/declared/test-retries-declared.mjs';
import { GOLANGCI_FILES as UNTYPED_GOLANGCI_FILES } from '../../../languages/go/adapters/formatting/go-formatters.mjs';
import type {
  AppliedValues,
  FileChange,
  ImportLinterConfig,
  OwnApplied,
  PolicyConfig,
  ProjectSide,
  ReplacedOptions,
} from './policy-types.mts';
import type { ResolvedLayout } from './typed-views.mts';

type Attempted<Value> =
  | { readonly value: Value; readonly error?: undefined }
  | { readonly value?: undefined; readonly error: unknown };
type ManifestSection = { readonly kind: string; readonly value?: unknown };
type Values = Readonly<Record<string, unknown>>;
type JscpdApplied =
  { readonly kind: 'applied'; readonly config: Values } | { readonly kind: 'rejected' };
type KotlinSettings = {
  readonly tools: Readonly<Record<string, { readonly precedence: readonly string[] }>>;
  readonly kotlin: { readonly formatter: string; readonly detektConfig: string | undefined };
};
type ConfigSide = { readonly root: string; readonly config: PolicyConfig };
type ProjectConfigChange = {
  readonly base: ConfigSide;
  readonly head: ConfigSide;
  readonly baseOptedIn: boolean;
};

type OwnChanges = (applied: OwnApplied) => FileChange[];
type RetryDeclaration = {
  readonly file: string;
  readonly setting: string;
  readonly value: unknown;
};
type DeclaredSource = {
  readonly paths: () => readonly string[];
  readonly readMany: (files: readonly string[]) => ReadonlyMap<string, string>;
};

const readPytestRetries: (root: string) => {
  readonly values: Values;
  readonly file: string | undefined;
} = untypedReadPytestRetries;
const directorySource: (root: string) => DeclaredSource = untypedDirectorySource;
const readDeclaredBuild: (source: DeclaredSource) => unknown = untypedReadDeclaredBuild;
const testRetryDeclarations: (build: unknown) => readonly RetryDeclaration[] =
  untypedTestRetryDeclarations;
const testRetryValues: (declarations: readonly RetryDeclaration[]) => Values =
  untypedTestRetryValues;

const strykerConfigChanges: OwnChanges = untypedStrykerConfigChanges;
const testsConfigChanges: OwnChanges = untypedTestsConfigChanges;
const typescriptConfigChanges: OwnChanges = untypedTypescriptConfigChanges;
const jscpdConfigChanges: OwnChanges = untypedJscpdConfigChanges;
const BUILD_DECLARED_TOOLS: readonly string[] = UNTYPED_BUILD_DECLARED_TOOLS;
const PROJECT_TOOL_CONFIGS: ReadonlyMap<string, string> = UNTYPED_PROJECT_TOOL_CONFIGS;
const JSCPD_PROJECT_FILE: string = UNTYPED_JSCPD_PROJECT_FILE;
const PRETTIER_PROJECT_FILES: readonly string[] = UNTYPED_PRETTIER_PROJECT_FILES;
const STRYKER_PROJECT_FILES: readonly string[] = UNTYPED_STRYKER_PROJECT_FILES;
const TESTS_TOOL: string = UNTYPED_TESTS_TOOL;
const GOLANGCI_FILES: readonly string[] = UNTYPED_GOLANGCI_FILES;
const declaredConfigFiles: (
  tool: string,
  side: { readonly root: string; readonly files: readonly string[] },
) => { readonly declarations: ReadonlyMap<string, string>; readonly files: readonly string[] } =
  untypedDeclaredConfigFiles;
function readInside(root: string, relative: string, encoding: 'utf8'): string | undefined {
  const raw: unknown = Reflect.apply(untypedReadInside, undefined, [root, relative, encoding]);
  return typeof raw === 'string' ? raw : undefined;
}
const readRealInside: (root: string, relative: string) => Buffer | undefined =
  untypedReadRealInside;
const precedenceLayers: (precedence: string[] | undefined) => {
  readonly usesProject: boolean;
  readonly nitpickerFirst: boolean;
} = untypedPrecedenceLayers;
const kotlinStyleFiles: (settings: KotlinSettings, policyRoot: string) => string[] =
  untypedKotlinStyleFiles;
const projectTsconfigFiles: (projectRoot: string, layout: ResolvedLayout) => string[] =
  untypedProjectTsconfigFiles;
const testRunnerProjectFiles: (projectRoot: string, config: PolicyConfig) => string[] =
  untypedTestRunnerProjectFiles;
const isProjectConfigTool: (tool: string) => boolean = untypedIsProjectConfigTool;
const manifestSection: (text: string, key: string | undefined) => ManifestSection =
  untypedManifestSection;
const packageJsonKey: (tool: string) => string | undefined = untypedPackageJsonKey;
const projectConfigCandidates: (tool: string) => string[] = untypedProjectConfigCandidates;
const projectConfigTools: () => string[] = untypedProjectConfigTools;
const appliedProjectConfigs: (
  tool: string,
  sides: ProjectConfigChange,
) => { readonly applied?: AppliedValues } = untypedAppliedProjectConfigs;
const projectConfigChanges: (tool: string, applied: AppliedValues) => FileChange[] =
  untypedProjectConfigChanges;
const hasProjectConfigChanges: (tool: string) => boolean = untypedHasProjectConfigChanges;
const eslintConfigFiles: (root: string) => string[] = untypedEslintConfigFiles;
const readEslintConfigFile: (root: string, relative: string) => Buffer | undefined =
  untypedReadEslintConfigFile;
const replacedEslintOptions: (config: PolicyConfig, projectRoot: string) => ReplacedOptions =
  untypedReplacedEslintOptions;
function appliedJscpdConfig(text: string): JscpdApplied {
  const applied = untypedAppliedJscpdConfig(text);
  return applied.kind === 'applied' && applied.config !== undefined
    ? { kind: 'applied', config: applied.config }
    : { kind: 'rejected' };
}
const appliedStrykerConfig: (projectRoot: string) => {
  readonly values: Values;
  readonly file?: string;
} = untypedAppliedStrykerConfig;
const appliedTypescriptOptions: (
  projectRoot: string,
  layout: ResolvedLayout,
) => { readonly config: Values; readonly file: string; readonly files: readonly string[] } =
  untypedAppliedTypescriptOptions;
const appliedRunnerRetry: (side: ProjectSide) => {
  readonly values: Values;
  readonly file: string | undefined;
  readonly files: readonly string[];
} = untypedAppliedRunnerRetry;
const readImportLinterConfig: (root: string) => ImportLinterConfig | undefined =
  untypedReadImportLinterConfig;
const attempt: <Value>(read: () => Value) => Attempted<Value> = untypedAttempt;

export {
  appliedJscpdConfig,
  appliedProjectConfigs,
  appliedRunnerRetry,
  appliedStrykerConfig,
  appliedTypescriptOptions,
  attempt,
  directorySource,
  BUILD_DECLARED_TOOLS,
  declaredConfigFiles,
  eslintConfigFiles,
  GOLANGCI_FILES,
  hasProjectConfigChanges,
  isProjectConfigTool,
  jscpdConfigChanges,
  JSCPD_PROJECT_FILE,
  kotlinStyleFiles,
  manifestSection,
  packageJsonKey,
  PRETTIER_PROJECT_FILES,
  PROJECT_TOOL_CONFIGS,
  projectConfigCandidates,
  projectConfigTools,
  projectTsconfigFiles,
  precedenceLayers,
  projectConfigChanges,
  readEslintConfigFile,
  readDeclaredBuild,
  readImportLinterConfig,
  readInside,
  readPytestRetries,
  readRealInside,
  replacedEslintOptions,
  STRYKER_PROJECT_FILES,
  strykerConfigChanges,
  TESTS_TOOL,
  testRetryDeclarations,
  testRetryValues,
  testRunnerProjectFiles,
  testsConfigChanges,
  typescriptConfigChanges,
};
