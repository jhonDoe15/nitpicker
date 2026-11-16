import {
  globMatcher as untypedGlobMatcher,
  globsMatcher as untypedGlobsMatcher,
} from '../../../shared/paths/glob.mjs';
import { prefixesOf as untypedPrefixesOf } from '../../../shared/paths/prefixes.mjs';
import {
  builtInExcludedGlobs as untypedBuiltInExcludedGlobs,
  defaultResolvedLayout as untypedDefaultResolvedLayout,
  resolveLayout as untypedResolveLayout,
  resolveLayoutFor as untypedResolveLayoutFor,
} from '../../../languages/typescript/preset/layout.mjs';
import {
  directlyImportedFiles as untypedDirectlyImportedFiles,
  packageEntryFiles as untypedPackageEntryFiles,
  productionReach as untypedProductionReach,
} from '../../../languages/typescript/preset/modules/production-imports.mjs';
import {
  pythonImportedFiles as untypedPythonImportedFiles,
  pythonProductionReach as untypedPythonProductionReach,
} from '../../../languages/python/adapters/analysis/reach/python-reach.mts';
import {
  canonicalRule as untypedCanonicalRule,
  normalizeFunctionName as untypedNormalizeFunctionName,
} from '../../../shared/exceptions/rule-names.mjs';
import { pathInside as untypedPathInside } from '../../../shared/filesystem.mjs';
import { projectFilePaths as untypedProjectFilePaths } from '../../../shared/project-files/project-files.mjs';
import { GRADLE_PRESETS as UNTYPED_GRADLE_PRESETS } from '../../../languages/java/adapters/gradle-presets.mjs';
import { readBuildSources as untypedReadBuildSources } from '../../../languages/java/builds/narrowing/build-sources.mjs';
import { jvmProductionReach as untypedJvmProductionReach } from '../../../languages/java/builds/reach/source-reach.mjs';
import { readPythonSelection as untypedReadPythonSelection } from '../../../languages/python/adapters/configuration/pytest/test-selection.mts';
import { detectSourceRoots as untypedDetectSourceRoots } from '../../../languages/python/adapters/execution/python-project.mts';
import {
  checksJavascript as untypedChecksJavascript,
  projectTsconfigs as untypedProjectTsconfigs,
} from '../../../languages/typescript/preset/modules/tsconfig-files.mjs';
import { checkedJavascriptFiles as untypedCheckedJavascriptFiles } from '../../../languages/typescript/preset/eslint-config/policy/untyped-javascript.mjs';
import { presetToDeclare as untypedPresetToDeclare } from '../../configuration/project-checks/preset-detection.mjs';
import { isGeneratedJvm as untypedIsGeneratedJvm } from '../../../languages/java/adapters/generated/generated-sources.mjs';
import { isGeneratedPython as untypedIsGeneratedPython } from '../../../languages/python/libraries/generated-files.mts';
import { isMarkedGenerated as untypedIsMarkedGenerated } from '../../../languages/typescript/preset/layout/generated-files.mjs';
import { isGeneratedGo as untypedIsGeneratedGo } from '../../../languages/go/adapters/structure/go-generated.mts';
import { fieldOf, listOf, textOf } from '../../../shared/values/readers.mts';
import type { BuildSource, LayoutConfig, PolicyConfig } from './policy-types.mts';

export type ResolvedLayout = {
  readonly sourceRoots: readonly string[];
  readonly testRoots: readonly string[];
  readonly extensions: readonly string[];
  readonly hiddenGlobs: readonly string[];
  readonly executedTestRoots: readonly string[];
  readonly isSourceFile: (file: string) => boolean;
  readonly isExcluded: (file: string) => boolean;
};

type Matcher = { readonly test: (file: string) => boolean };
type ReachOptions = {
  readonly sourceRoots: readonly string[];
  readonly isHidden: (file: string) => boolean;
};
type EntryFile = { readonly file: string; readonly label: string };

const globMatcher: (glob: string) => Matcher = untypedGlobMatcher;
const prefixesOf: (text: string, separator: string) => string[] = untypedPrefixesOf;
const globsMatcher: (globs?: string[]) => (file: string) => boolean = untypedGlobsMatcher;
const canonicalRule: (rule: string) => string = untypedCanonicalRule;
const normalizeFunctionName: (name: string) => string = untypedNormalizeFunctionName;
const resolveLayoutFor: (config: PolicyConfig) => ResolvedLayout = untypedResolveLayoutFor;
const resolveLayout: (
  layout: LayoutConfig | undefined,
  exclude: string[],
  options: { readonly javascript: boolean },
) => ResolvedLayout = untypedResolveLayout;
const defaultResolvedLayout: ResolvedLayout = untypedDefaultResolvedLayout;
const sourceRoots = defaultResolvedLayout.sourceRoots;
const testRoots = defaultResolvedLayout.testRoots;
const builtInExcludedGlobs: readonly string[] = untypedBuiltInExcludedGlobs;
const directlyImportedFiles: (
  projectRoot: string,
  importers: readonly string[],
) => ReadonlySet<string> = untypedDirectlyImportedFiles;
const packageEntryFiles: (projectRoot: string, files: readonly string[]) => readonly EntryFile[] =
  untypedPackageEntryFiles;
type ProductionReachOptions = {
  readonly importers: readonly string[];
  readonly entries: readonly EntryFile[];
};

function productionReach(
  projectRoot: string,
  options: ProductionReachOptions,
): ReadonlyMap<string, string> {
  const raw: unknown = Reflect.apply(untypedProductionReach, undefined, [projectRoot, options]);
  return reachedLabels(raw);
}
const pythonImportedFiles: (projectRoot: string, options: ReachOptions) => ReadonlySet<string> =
  untypedPythonImportedFiles;
const pythonProductionReach: (
  projectRoot: string,
  options: ReachOptions,
) => ReadonlyMap<string, string> = untypedPythonProductionReach;

type ReachFiles = {
  readonly files: readonly string[];
  readonly isImporter: (file: string) => boolean;
};
type GeneratedTest = (projectRoot: string, file: string) => boolean;

const pathInside: (root: string, relative: string) => string | undefined = untypedPathInside;
const projectFilePaths: (projectRoot: string) => string[] = untypedProjectFilePaths;
const GRADLE_PRESETS: readonly (string | undefined)[] = UNTYPED_GRADLE_PRESETS;
const readBuildSources: (projectRoot: string, files: readonly string[]) => BuildSource[] =
  untypedReadBuildSources;
const detectSourceRoots: (projectRoot: string, setting: readonly string[] | undefined) => string[] =
  untypedDetectSourceRoots;
const checksJavascript: (configFile: string) => boolean = untypedChecksJavascript;
const checkedJavascriptFiles: (projectRoot: string, layout: ResolvedLayout) => string[] =
  untypedCheckedJavascriptFiles;
const projectTsconfigs: (
  projectRoot: string,
  files: readonly string[],
  isHidden: (...args: never[]) => boolean,
) => string[] = untypedProjectTsconfigs;
const presetToDeclare: (config: PolicyConfig, projectRoot: string) => unknown =
  untypedPresetToDeclare;
const isGeneratedJvm: GeneratedTest = untypedIsGeneratedJvm;
const isGeneratedPython: GeneratedTest = untypedIsGeneratedPython;
const isMarkedGenerated: GeneratedTest = untypedIsMarkedGenerated;
const isGeneratedGo: GeneratedTest = untypedIsGeneratedGo;

function isBuildSource(value: unknown): value is BuildSource {
  const type = fieldOf(value, 'type');
  return type === 'roots' || type === 'includes' || type === 'excludes';
}

function readPythonSelection(projectRoot: string, sourceRoots: readonly string[]): BuildSource[] {
  const raw: unknown = Reflect.apply(untypedReadPythonSelection, undefined, [
    projectRoot,
    sourceRoots,
  ]);
  return listOf(raw).filter(isBuildSource);
}

function jvmProductionReach(projectRoot: string, options: ReachFiles): ReadonlyMap<string, string> {
  const raw: unknown = Reflect.apply(untypedJvmProductionReach, undefined, [projectRoot, options]);
  return reachedLabels(raw);
}

function reachedLabels(raw: unknown): ReadonlyMap<string, string> {
  const reached = new Map<string, string>();
  if (raw instanceof Map) {
    const entries: ReadonlyMap<unknown, unknown> = raw;
    for (const [file, label] of entries) {
      reached.set(textOf(file), textOf(label));
    }
  }
  return reached;
}

export {
  builtInExcludedGlobs,
  canonicalRule,
  checkedJavascriptFiles,
  checksJavascript,
  defaultResolvedLayout,
  detectSourceRoots,
  directlyImportedFiles,
  globMatcher,
  globsMatcher,
  GRADLE_PRESETS,
  isGeneratedGo,
  isGeneratedJvm,
  isGeneratedPython,
  isMarkedGenerated,
  jvmProductionReach,
  normalizeFunctionName,
  packageEntryFiles,
  pathInside,
  prefixesOf,
  presetToDeclare,
  productionReach,
  projectFilePaths,
  projectTsconfigs,
  pythonImportedFiles,
  pythonProductionReach,
  readBuildSources,
  readPythonSelection,
  resolveLayout,
  resolveLayoutFor,
  sourceRoots,
  testRoots,
};
