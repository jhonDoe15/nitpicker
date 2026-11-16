import type { FixFile, FixOutcome } from '../../../core/fix/typed/fix-types.mts';
import {
  collectFixFiles,
  excludedBy,
  fixerError,
  linkNote,
  rewrittenPaths,
  runRecipes,
  SHARED_RECIPES,
  readBytes,
  sharedInputs,
} from '../../../core/fix/typed/fix-views.mts';
import type { ToolContext } from '../adapters/typed/context/tool-context-types.mts';
import type {
  FixersResult,
  Gathered,
  PythonFixSettings,
  RunSettings,
  StepInput,
} from './typed/python-fix-types.mts';
import { commandRunner, withPythonFixContext } from './python-fix-session.mts';
import type { FixPolicy } from './python-fix-session.mts';
import { formatStep, formatterOf, formattedFiles, lintStep } from './python-fix-steps.mts';
import { fixOptions } from './source/fix-options.mts';
import { FIX_SCRIPT, SCRIPT_OPERATION } from './source/script-edits.mts';
import { createPythonRecipes } from './recipes/python-recipes.mts';
import { dependencyInputs } from './recipes/inputs/dependency-inputs.mts';
import { docstringInputs } from './recipes/inputs/docstring-inputs.mts';
import { unusedIgnoreInputs } from './recipes/inputs/unused-ignore-inputs.mts';

const PYTHON_FILE = /\.(?:pyi?|ipynb)$/u;
type Run = ReturnType<typeof commandRunner>;
type Step = { toolErrors: unknown[]; notes: string[] };

function fixFailure(
  tool: string,
  error: unknown,
): ReturnType<typeof fixerError> & { rule: string } {
  return { ...fixerError(tool, error), rule: 'fix-failed' };
}

function attempt(tool: string, step: () => string[]): Step {
  try {
    return { toolErrors: [], notes: step() };
  } catch (error) {
    return { toolErrors: [fixFailure(tool, error)], notes: [] };
  }
}

const DEPENDENCY_SELECTIONS = [
  'dependencies/unused-dependency',
  'dependencies/unlisted-dependency',
  'dependencies/no-dev-dependency-in-production',
];

function recipeInputs(
  context: ToolContext,
  files: readonly FixFile[],
  selectedRules: readonly string[],
): Gathered {
  try {
    return {
      inputs: {
        pythonDocstrings: docstringInputs(context, files),
        ...(selectedRules.some((rule) => DEPENDENCY_SELECTIONS.includes(rule))
          ? { pythonDependencies: dependencyInputs(context) }
          : {}),
        ...(selectedRules.includes('mypy/unused-ignore')
          ? { pythonUnusedIgnores: unusedIgnoreInputs(context, files) }
          : {}),
      },
      toolErrors: [],
    };
  } catch (error) {
    return { inputs: {}, toolErrors: [fixFailure('python-recipe-inputs', error)] };
  }
}

function pythonRecipes(context: ToolContext, run: Run): ReturnType<typeof createPythonRecipes> {
  return createPythonRecipes({
    runScript: (input: string) =>
      run({
        operation: SCRIPT_OPERATION,
        command: ['python', '-I', FIX_SCRIPT],
        acceptedStatuses: [0],
        input,
      }).stdout,
    optionsFor: fixOptions(context),
  });
}

function recipeStep({
  context,
  run,
  settings,
  files,
  accepts,
}: {
  context: ToolContext;
  run: Run;
  settings: RunSettings;
  files: readonly FixFile[];
  accepts: (name: string) => boolean;
}): Step & { files: readonly FixFile[]; fixedFindings: readonly string[] } {
  const selectedRules = settings.selectedRules;
  const shared = sharedInputs({
    projectRoot: settings.projectRoot,
    headPolicy: settings.headPolicy,
    selectedRules,
  });
  const gathered = recipeInputs(context, files, selectedRules);
  const recipes = runRecipes({
    projectRoot: settings.projectRoot,
    files,
    recipes: [...pythonRecipes(context, run), ...SHARED_RECIPES],
    writer: settings.writer,
    preset: settings.config.preset ?? 'python',
    selectedRules,
    accepts,
    inputs: { ...shared.inputs, ...gathered.inputs },
  });
  return {
    files: recipes.files,
    fixedFindings: recipes.fixedFindings,
    toolErrors: [...shared.toolErrors, ...gathered.toolErrors, ...recipes.toolErrors],
    notes: [...recipes.notes],
  };
}

function runFixers(
  settings: RunSettings,
  files: readonly FixFile[],
  mergeBaseSha: string | undefined,
): FixersResult {
  try {
    return withPythonFixContext(settings, (context) => {
      const run = commandRunner(context, settings.executeFixCommand);
      const before = readBytes(settings.projectRoot, files);
      const recipes = recipeStep({ context, run, settings, files, accepts: settings.accepts });
      const step: StepInput = {
        context,
        run,
        settings,
        projectRoot: settings.projectRoot,
        files: recipes.files,
        mergeBaseSha,
        selectedRules: settings.selectedRules,
        writer: settings.writer,
      };
      const lint: { written: string[] } = { written: [] };
      const outcomes = [
        attempt('ruff-fix', () => {
          const outcome = lintStep(step);
          lint.written = outcome.written;
          return outcome.notes;
        }),
        attempt(formatterOf(context.project.formatter).operation, () =>
          formatStep({ ...step, files: formattedFiles({ ...step, before }, lint.written) }),
        ),
      ];
      return {
        fixedFindings: recipes.fixedFindings,
        renamed: recipes.files.filter(({ path: name }, index) => name !== files[index]?.path),
        toolErrors: [...recipes.toolErrors, ...outcomes.flatMap(({ toolErrors }) => toolErrors)],
        notes: [...recipes.notes, ...outcomes.flatMap(({ notes }) => notes)],
      };
    });
  } catch (error) {
    return { toolErrors: [fixFailure('python-fix', error)], notes: [] };
  }
}

export function fixPython(settings: PythonFixSettings): FixOutcome {
  const { repositoryRoot, projectRoot, baseRef, scope } = settings;
  const headPolicy: FixPolicy = settings.headPolicy ?? {};
  const excluded = excludedBy(headPolicy.exclude);
  function accepts(name: string): boolean {
    return PYTHON_FILE.test(name) && !excluded(name);
  }
  const { comparison, files, links } = collectFixFiles({
    repositoryRoot,
    projectRoot,
    baseRef,
    scope,
    allFiles: settings.allFiles,
    accepts,
  });
  if (files.length === 0 && (settings.selectedRules ?? []).length === 0) {
    return { fixedFiles: [], toolErrors: [], notes: linkNote(links) };
  }
  const before = readBytes(projectRoot, files);
  const {
    fixedFindings = [],
    renamed = [],
    toolErrors,
    notes,
  } = runFixers(
    { ...settings, headPolicy, accepts, selectedRules: settings.selectedRules ?? [] },
    files,
    comparison.mergeBaseSha,
  );
  return {
    fixedFiles: [
      ...rewrittenPaths(projectRoot, files, before),
      ...renamed.map(({ path: name }) => name),
    ],
    ...(fixedFindings.length === 0 ? {} : { fixedFindings }),
    toolErrors,
    notes: [...notes, ...linkNote(links)],
  };
}
