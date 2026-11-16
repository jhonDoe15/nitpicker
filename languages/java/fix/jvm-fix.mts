import { fixerError, fixSpawn } from '../../../core/fix/common/fix-command.mjs';
import { excludedBy } from '../../../core/fix/common/fix-files.mjs';
import { formatNotes } from '../../../core/fix/common/fix-notes.mjs';
import { rewriteFormatted } from '../../../core/fix/common/format-rewrite.mjs';
import { toolPrecedenceOf } from '../../../core/fix/common/tool-precedence.mjs';
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
import { kotlinStyleFile, resolveKotlinTools } from '../adapters/kotlin/kotlin-tools.mjs';
import { declaredSourceRoots } from '../adapters/notices/declared-roots.mjs';
import { inJvmSourceSets } from '../adapters/notices/outside-roots-notice.mjs';
import {
  javaFormatterFlags,
  javaFormatterSettings,
  javaStyle,
} from '../adapters/style/java-style.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';
import { formatterJava } from '../maven/errorprone/maven-jdk.mjs';
import { javaFormat, javaFormatterPlan } from './java-format.mts';
import { kotlinFormat, kotlinFormatterPlan } from './kotlin-format.mts';
import { defineRecipes } from '../../../core/fix/engine/recipes.mjs';
import { errorPronePatch } from './errorprone/run/error-prone-step.mjs';
import { errorProneRecipes } from './errorprone/recipes/error-prone-recipes.mjs';
import { JVM_RECIPES } from './recipes/jvm-recipes.mjs';
import { SPRING_CONFIG_FILE } from './recipes/spring/config/config-targets.mjs';
import { resolveToolClasspaths } from './tools/tool-classpath.mts';
import { callUntyped } from '../adapters/typed/java-values.mts';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../shared/values/readers.mts';

type JvmSettings = Omit<FixSettings, 'allFiles' | 'selectedRules' | 'recipes'> & {
  readonly allFiles?: boolean;
  readonly selectedRules?: readonly string[];
  readonly recipes?: unknown;
  readonly environment?: unknown;
};
type Resolved = JvmSettings & { readonly headPolicy: unknown; readonly config: unknown };
type Plan = Readonly<Record<string, unknown>> & {
  readonly operation: string;
  readonly label: string;
};
type Classpaths = Readonly<Record<string, unknown>>;
type FormatStep = {
  readonly files: readonly unknown[];
  readonly plan: Plan;
  readonly touchedLinesOnly?: boolean;
  readonly formatWith: (classpaths: Classpaths) => unknown;
};
type Attempt = FixStep & Readonly<Record<string, unknown>>;
type Planned = Attempt & { readonly plan: Plan | undefined };
type RecipeRequest = {
  readonly settings: Resolved;
  readonly files: readonly FixFile[];
  readonly accepts: (name: string) => boolean;
  readonly selectedRules: readonly string[];
  readonly patchEntries: unknown;
};

const JAVA_FILE = /\.java$/u;
const KOTLIN_FILE = /\.kt$/u;
const NO_JAVA_FORMATTER =
  'No Java formatter runs for this project (conventions "java.formatter" is "none"), so Java files were not rewritten';
const BUILD_JAVA_FORMATTER =
  'The build enforces Spring Java Format (conventions "java.formatter" is "spring"), which nitpicker does not run, so Java files were not rewritten: run its apply goal or format task';
const NO_KOTLIN_FORMATTER =
  'No Kotlin formatter found, so Kotlin files were not rewritten: set "kotlin.formatter" to "ktlint" or "ktfmt" in nitpicker.config.json to format them';
const springConfigFile: RegExp = SPRING_CONFIG_FILE;
const jvmRecipes: readonly unknown[] = JVM_RECIPES;
const sharedRecipes: readonly unknown[] = SHARED_RECIPES;

function planOf(value: unknown): Plan | undefined {
  return value === undefined
    ? undefined
    : {
        ...fieldsOf(value),
        operation: textOf(fieldOf(value, 'operation')),
        label: textOf(fieldOf(value, 'label')),
      };
}

function javaStep(settings: Resolved, files: readonly FixFile[], pinned: unknown): unknown {
  const { headPolicy, executeFixCommand } = settings;
  const conventions = fieldOf(headPolicy, 'conventions');
  const style = textOf(javaStyle(conventions));
  const version = fieldOf(callUntyped(javaFormatterSettings, conventions), 'version');
  const plan = planOf(callUntyped(javaFormatterPlan, style, pinned, version));
  if (plan === undefined) {
    return { notes: [style === 'spring' ? BUILD_JAVA_FORMATTER : NO_JAVA_FORMATTER] };
  }
  return {
    files,
    plan,
    formatWith: (classpaths: Classpaths) =>
      callUntyped(javaFormat, {
        style,
        flags: callUntyped(javaFormatterFlags, conventions),
        classpath: classpaths['java-format'],
        java: callUntyped(formatterJava, {
          tool: plan.label,
          spawn: callUntyped(fixSpawn, { operation: 'java-probe', executeFixCommand }),
        }),
        executeFixCommand,
      }),
  };
}

function kotlinTools(settings: Resolved): unknown {
  const { projectRoot, headPolicy, config } = settings;
  const kotlin = fieldOf(config, 'kotlin');
  return callUntyped(resolveKotlinTools, projectRoot, {
    formatter: fieldOf(fieldOf(headPolicy, 'kotlin'), 'formatter') ?? fieldOf(kotlin, 'formatter'),
    detektConfig: fieldOf(kotlin, 'detektConfig'),
    conventions: fieldOf(headPolicy, 'conventions') ?? {},
    policyRoot: projectRoot,
    toolPrecedence: callUntyped(toolPrecedenceOf, fieldOf(headPolicy, 'tools')),
  });
}

function kotlinStep(settings: Resolved, files: readonly FixFile[], pinned: unknown): unknown {
  const tools = kotlinTools(settings);
  const formatter = fieldOf(tools, 'formatter');
  const plan = planOf(callUntyped(kotlinFormatterPlan, formatter, pinned));
  const conventions = fieldOf(settings.headPolicy, 'conventions') ?? {};
  const style = callUntyped(kotlinStyleFile, tools, conventions);
  if (plan === undefined) {
    return { notes: [NO_KOTLIN_FORMATTER] };
  }
  return {
    files,
    plan,
    touchedLinesOnly: formatter === 'ktlint',
    formatWith: (classpaths: Classpaths) =>
      callUntyped(kotlinFormat, {
        formatter,
        tools,
        style,
        classpath: classpaths[textOf(formatter)],
        executeFixCommand: settings.executeFixCommand,
      }),
  };
}

function attempt(tool: string, step: () => unknown): Attempt {
  try {
    return { toolErrors: [], notes: [], ...fieldsOf(step()) };
  } catch (error) {
    return { toolErrors: [callUntyped(fixerError, tool, error)], notes: [] };
  }
}

function plannedSteps(settings: Resolved, files: readonly FixFile[]): Planned[] {
  const pinned: unknown = readPinnedTools();
  const javaFiles = files.filter(({ path: name }) => JAVA_FILE.test(name));
  const kotlinFiles = files.filter(({ path: name }) => KOTLIN_FILE.test(name));
  return [
    ...(javaFiles.length === 0
      ? []
      : [attempt('java-format-fix', () => javaStep(settings, javaFiles, pinned))]),
    ...(kotlinFiles.length === 0
      ? []
      : [attempt('kotlin-format-fix', () => kotlinStep(settings, kotlinFiles, pinned))]),
  ].map((step) => ({ ...step, plan: planOf(step['plan']) }));
}

function formatStepOf(step: Attempt, plan: Plan): FormatStep {
  const formatWith = step['formatWith'];
  return {
    files: listOf(step['files']),
    plan,
    touchedLinesOnly: step['touchedLinesOnly'] === true,
    formatWith: (classpaths) =>
      typeof formatWith === 'function' ? callUntyped(formatWith, classpaths) : undefined,
  };
}

function applyStep(step: FormatStep, classpaths: Classpaths, scope: object): Attempt {
  return attempt(step.plan.operation, () => ({
    notes: callUntyped(
      formatNotes,
      step.plan.label,
      callUntyped(rewriteFormatted, {
        ...scope,
        files: step.files,
        format: step.formatWith(classpaths),
        touchedLinesOnly: step.touchedLinesOnly === true,
        tool: step.plan.label,
      }),
    ),
  }));
}

function rewriteScope(settings: Resolved, mergeBaseSha: string | undefined): object {
  const { projectRoot, repositoryRoot, writer, allFiles } = settings;
  return { projectRoot, repositoryRoot, mergeBaseSha, writer, allFiles: allFiles === true };
}

function runSteps(
  settings: Resolved,
  steps: readonly Planned[],
  mergeBaseSha: string | undefined,
): Attempt[] {
  const unplanned = steps.filter(({ plan }) => plan === undefined);
  const active = steps.flatMap(({ plan, ...step }) =>
    plan === undefined ? [] : [formatStepOf(step, plan)],
  );
  const resolved = attempt('fix-tools', () => ({
    classpaths:
      active.length === 0
        ? {}
        : callUntyped(resolveToolClasspaths, {
            projectRoot: settings.projectRoot,
            buildTool: fieldOf(fieldOf(settings.config, 'java'), 'buildTool'),
            environment: settings.environment,
            executeFixCommand: settings.executeFixCommand,
            tools: Object.assign({}, ...active.map(({ plan }) => fieldsOf(plan['tools']))),
          }),
  }));
  const classpaths = resolved['classpaths'];
  if (classpaths === undefined) {
    return [...unplanned, resolved];
  }
  const scope = rewriteScope(settings, mergeBaseSha);
  return [...unplanned, ...active.map((step) => applyStep(step, fieldsOf(classpaths), scope))];
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
      ...listOf(callUntyped(errorProneRecipes, patchEntries)),
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

function notesOf(steps: readonly Attempt[]): string[] {
  return steps.flatMap(({ notes }) => notes.map(textOf));
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
  const patch = attempt('error-prone-fix', () => ({
    entries: callUntyped(errorPronePatch, resolved, files, comparison.mergeBaseSha),
  }));
  const patchEntries = patch['entries'] ?? new Map();
  const recipes = recipeRun({ settings: resolved, files, accepts, selectedRules, patchEntries });
  const formatted =
    selectedRules.length === 0 ? recipes.files : changedFiles(projectRoot, recipes.files, before);
  const outcomes = runSteps(resolved, plannedSteps(resolved, formatted), comparison.mergeBaseSha);
  return {
    fixedFiles: rewrittenPaths(projectRoot, files, before),
    ...(recipes.fixedFindings === undefined ? {} : { fixedFindings: recipes.fixedFindings }),
    toolErrors: [patch, recipes, ...outcomes].flatMap(({ toolErrors }) => toolErrors),
    notes: [...notesOf([patch, recipes, ...outcomes]), ...linkNote(links)],
  };
}
