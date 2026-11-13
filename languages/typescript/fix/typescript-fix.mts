import {
  headPolicyEnvironment,
  resolveHeadPolicy,
  withHeadPolicyFile,
} from '../preset/head-policy.mjs';
import { resolveLayoutFor } from '../preset/layout.mjs';
import {
  changedFiles,
  collectFixFiles,
  readBytes,
  rewrittenPaths,
  splitByEncoding,
} from '../../../core/fix/common/fix-files.mjs';
import { linkNote, undecodableNote } from '../../../core/fix/common/fix-notes.mjs';
import { runRecipes } from '../../../core/fix/engine/run-recipes.mjs';
import { SHARED_RECIPES } from '../../../core/fix/recipes/shared-recipes.mjs';
import { sharedInputs } from '../../../core/fix/recipes/shared-inputs.mjs';
import { TYPESCRIPT_RECIPES } from './recipes/typescript-recipes.mjs';
import { fixTargets } from './fix-targets.mjs';
import { type FixFile, type KnipFixSettings, knipFixStep } from './dead-code/knip-fix-step.mts';
import { codeFixStep } from './code-fixes/code-fix-step.mjs';
import { eslintFixStep } from './eslint-fix.mjs';
import { prettierFixStep } from './prettier-fix.mjs';

type Layout = { readonly isExcluded: (name: string) => boolean };
type FixSettings = KnipFixSettings & {
  readonly repositoryRoot: string;
  readonly baseRef: unknown;
  readonly allFiles?: boolean;
  readonly scope: unknown;
  readonly layout: Layout;
  readonly eslintSettings: unknown;
  readonly headPolicy: object;
  readonly config?: { readonly preset?: string };
  readonly selectedRules: readonly string[];
};
type Step = {
  readonly toolErrors: readonly unknown[];
  readonly notes: readonly string[];
  readonly fixedFindings?: readonly unknown[];
};
type RecipeResult = Step & { readonly files: readonly FixFile[] };
type SharedInputs = { readonly inputs: unknown; readonly toolErrors: readonly unknown[] };

const runRecipeSet = runRecipes as (options: object) => RecipeResult;
const sharedRecipeInputs = sharedInputs as (options: object) => SharedInputs;

type TypeScriptFixOptions = Omit<
  FixSettings,
  | 'layout'
  | 'knipSettings'
  | 'eslintSettings'
  | 'headPolicy'
  | 'policyEnvironment'
  | 'selectedRules'
> & {
  readonly headPolicy?: object & {
    readonly tools?: { readonly eslint?: unknown; readonly knip?: unknown };
  };
  readonly selectedRules?: readonly string[];
};

function isManifest(name: string): boolean {
  return /(?:^|\/)package\.json$/u.test(name);
}

function findingsField(steps: readonly Step[]) {
  const fixedFindings = steps.flatMap((step) => step.fixedFindings ?? []);
  return fixedFindings.length === 0 ? {} : { fixedFindings };
}

function recipeRun({
  settings,
  files,
  accepts,
  inputs,
}: {
  readonly settings: FixSettings;
  readonly files: readonly FixFile[];
  readonly accepts: (name: string) => boolean;
  readonly inputs: unknown;
}) {
  return runRecipeSet({
    projectRoot: settings.projectRoot,
    files,
    recipes: [...TYPESCRIPT_RECIPES, ...SHARED_RECIPES],
    writer: settings.writer,
    preset: settings.config?.preset ?? 'typescript',
    selectedRules: settings.selectedRules,
    accepts,
    inputs,
  });
}

function fixSteps(
  settings: FixSettings,
  {
    decodable,
    formatted,
    before,
    isEslintFile,
    mergeBaseSha,
  }: {
    readonly decodable: readonly FixFile[];
    readonly formatted: readonly FixFile[];
    readonly before: Map<string, Buffer>;
    readonly isEslintFile: (name: string) => boolean;
    readonly mergeBaseSha: string | undefined;
  },
): Step[] {
  const eslintFiles = decodable.filter(({ path: name }: FixFile) => isEslintFile(name));
  return [
    codeFixStep(settings, eslintFiles),
    knipFixStep(
      settings,
      decodable.filter(({ path: name }: FixFile) => isEslintFile(name) || isManifest(name)),
    ),
    eslintFixStep(settings, eslintFiles),
    prettierFixStep(
      settings,
      settings.selectedRules.length === 0
        ? formatted
        : changedFiles(settings.projectRoot, formatted, before),
      mergeBaseSha,
    ),
  ];
}

function fixWithPolicy(settings: FixSettings) {
  const { repositoryRoot, projectRoot, baseRef, scope, layout } = settings;
  const { selectedRules } = settings;
  const { isEslintFile, isPrettierFile } = fixTargets(layout);
  function accepts(name: string): boolean {
    return (
      !layout.isExcluded(name) && (isEslintFile(name) || isPrettierFile(name) || isManifest(name))
    );
  }
  const { comparison, files, links } = collectFixFiles({
    repositoryRoot,
    projectRoot,
    baseRef,
    scope,
    allFiles: settings.allFiles === true,
    accepts,
  });
  const before = readBytes(projectRoot, files);
  const shared = sharedRecipeInputs({
    projectRoot,
    headPolicy: settings.headPolicy,
    selectedRules,
  });
  const recipes = recipeRun({ settings, files, accepts, inputs: shared.inputs });
  const { files: decodable, undecodable } = splitByEncoding(projectRoot, recipes.files);
  const formatted = decodable.filter(({ path: name }: FixFile) => isPrettierFile(name));
  const steps = fixSteps(settings, {
    decodable,
    formatted,
    before,
    isEslintFile,
    mergeBaseSha: comparison.mergeBaseSha,
  });
  return {
    fixedFiles: rewrittenPaths(projectRoot, files, before),
    ...findingsField([recipes, ...steps]),
    toolErrors: [
      ...shared.toolErrors,
      ...recipes.toolErrors,
      ...steps.flatMap(({ toolErrors }) => toolErrors),
    ],
    notes: [
      ...recipes.notes,
      ...steps.flatMap(({ notes }) => notes),
      ...undecodableNote(undecodable),
      ...linkNote(links),
    ],
  };
}

export function fixTypeScript({
  headPolicy = resolveHeadPolicy(),
  ...options
}: TypeScriptFixOptions) {
  return withHeadPolicyFile(headPolicy, (policyFile: string) =>
    fixWithPolicy({
      ...options,
      selectedRules: options.selectedRules ?? [],
      headPolicy,
      layout: resolveLayoutFor(headPolicy),
      eslintSettings: headPolicy.tools?.eslint,
      knipSettings: headPolicy.tools?.knip,
      policyEnvironment: headPolicyEnvironment(policyFile),
    }),
  );
}
