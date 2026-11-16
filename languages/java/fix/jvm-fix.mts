import { fixerError } from '../../../core/fix/common/fix-command.mjs';
import { excludedBy } from '../../../core/fix/common/fix-files.mjs';
import { SHARED_RECIPES } from '../../../core/fix/recipes/shared-recipes.mjs';
import {
  changedFiles,
  collectFixFiles,
  linkNote,
  readBytes,
  rewrittenPaths,
  runRecipes,
  sharedInputs,
} from '../../../core/fix/typed/fix-common.mts';
import type {
  FixFile,
  FixOutcome,
  FixSettings,
  FixStep,
} from '../../../core/fix/typed/fix-types.mts';
import { isGeneratedJvm } from '../adapters/generated/generated-sources.mjs';
import { declaredSourceRoots } from '../adapters/notices/declared-roots.mjs';
import { inJvmSourceSets } from '../adapters/notices/outside-roots-notice.mjs';
import { defineRecipes } from '../../../core/fix/engine/recipes.mjs';
import { errorPronePatch } from './errorprone/run/error-prone-step.mts';
import { type PatchEntries, errorProneRecipes } from './errorprone/recipes/error-prone-recipes.mts';
import { JVM_RECIPES } from './recipes/jvm-recipes.mjs';
import { SPRING_CONFIG_FILE } from './recipes/spring/config/config-targets.mjs';
import type { Environment } from './tools/tool-classpath.mts';
import { formatSteps } from './format/format-steps.mts';
import { callUntyped } from '../adapters/typed/java-values.mts';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../shared/values/readers.mts';

type JvmSettings = Omit<FixSettings, 'allFiles' | 'selectedRules' | 'recipes'> & {
  readonly allFiles?: boolean;
  readonly selectedRules?: readonly string[];
  readonly recipes?: unknown;
  readonly environment?: Environment;
};
type Resolved = JvmSettings & { readonly headPolicy: unknown; readonly config: unknown };
type RecipeRequest = {
  readonly settings: Resolved;
  readonly files: readonly FixFile[];
  readonly accepts: (name: string) => boolean;
  readonly selectedRules: readonly string[];
  readonly patchEntries: PatchEntries;
};

const JAVA_FILE = /\.java$/u;
const KOTLIN_FILE = /\.kt$/u;
const springConfigFile: RegExp = SPRING_CONFIG_FILE;
const jvmRecipes: readonly unknown[] = JVM_RECIPES;
const sharedRecipes: readonly unknown[] = SHARED_RECIPES;

function patchAttempt(
  settings: Resolved,
  files: readonly FixFile[],
  mergeBaseSha: string | undefined,
): FixStep & { readonly entries: PatchEntries } {
  try {
    return { toolErrors: [], notes: [], entries: errorPronePatch(settings, files, mergeBaseSha) };
  } catch (error) {
    return {
      toolErrors: [callUntyped(fixerError, 'error-prone-fix', error)],
      notes: [],
      entries: new Map(),
    };
  }
}

function recipeRun({ settings, files, accepts, selectedRules, patchEntries }: RecipeRequest) {
  const shared = sharedInputs({
    projectRoot: settings.projectRoot,
    headPolicy: fieldsOf(settings.headPolicy),
    selectedRules,
  });
  const recipes =
    settings.recipes ??
    callUntyped(defineRecipes, [
      ...jvmRecipes,
      ...sharedRecipes,
      ...errorProneRecipes(patchEntries),
    ]);
  const run = runRecipes({
    projectRoot: settings.projectRoot,
    files,
    recipes: listOf(recipes),
    writer: settings.writer,
    preset: textOf(fieldOf(settings.config, 'preset') ?? 'java'),
    selectedRules,
    accepts,
    inputs: shared.inputs,
  });
  return { ...run, toolErrors: [...shared.toolErrors, ...run.toolErrors] };
}

function acceptsOf({ projectRoot, headPolicy, config }: Resolved): (name: string) => boolean {
  const excluded = callUntyped(excludedBy, fieldOf(headPolicy, 'exclude'));
  const withKotlin = fieldOf(config, 'preset') === 'kotlin';
  const roots: unknown = declaredSourceRoots(projectRoot);
  function isExcluded(name: string): boolean {
    return callUntyped(excluded, name) === true;
  }
  return function accepts(name: string): boolean {
    return (
      (springConfigFile.test(name) && !isExcluded(name)) ||
      ((JAVA_FILE.test(name) || (withKotlin && KOTLIN_FILE.test(name))) &&
        !isExcluded(name) &&
        callUntyped(inJvmSourceSets, name, roots) === true &&
        callUntyped(isGeneratedJvm, projectRoot, name) !== true)
    );
  };
}

function notesOf(steps: readonly FixStep[]): string[] {
  return steps.flatMap(({ notes }) => notes);
}

export function fixJvm(settings: JvmSettings): FixOutcome {
  const { repositoryRoot, projectRoot, baseRef, scope } = settings;
  const config = settings.config ?? {};
  const selectedRules = settings.selectedRules ?? [];
  const headPolicy = settings.headPolicy ?? {};
  const resolved = { ...settings, headPolicy, config };
  const accepts = acceptsOf(resolved);
  const allFiles = settings.allFiles === true;
  const fileSet = collectFixFiles({
    repositoryRoot,
    projectRoot,
    baseRef,
    scope,
    accepts,
    allFiles,
  });
  const { comparison, files, links } = fileSet;
  if (files.length === 0 && selectedRules.length === 0) {
    return { fixedFiles: [], toolErrors: [], notes: linkNote(links) };
  }
  const before = readBytes(projectRoot, files);
  const patch = patchAttempt(resolved, files, comparison.mergeBaseSha);
  const patchEntries = patch.entries;
  const recipes = recipeRun({ settings: resolved, files, accepts, selectedRules, patchEntries });
  const formatted =
    selectedRules.length === 0 ? recipes.files : changedFiles(projectRoot, recipes.files, before);
  const outcomes = formatSteps(resolved, formatted, comparison.mergeBaseSha);
  return {
    fixedFiles: rewrittenPaths(projectRoot, files, before),
    ...(recipes.fixedFindings === undefined ? {} : { fixedFindings: recipes.fixedFindings }),
    toolErrors: [patch, recipes, ...outcomes].flatMap(({ toolErrors }) => toolErrors),
    notes: [...notesOf([patch, recipes, ...outcomes]), ...linkNote(links)],
  };
}
