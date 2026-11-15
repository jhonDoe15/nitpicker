import {
  headPolicyEnvironment as untypedHeadPolicyEnvironment,
  resolveHeadPolicy as untypedResolveHeadPolicy,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from '../preset/head-policy.mjs';
import { resolveLayoutFor as untypedResolveLayoutFor } from '../preset/layout.mjs';
import {
  changedFiles,
  collectFixFiles,
  linkNote,
  readBytes,
  rewrittenPaths,
  runRecipes,
  SHARED_RECIPES,
  sharedInputs,
  splitByEncoding,
  undecodableNote,
} from '../../../core/fix/typed/fix-views.mts';
import type { Bytes, RecipeResult } from '../../../core/fix/typed/fix-views.mts';
import type {
  FixFile,
  FixOutcome,
  FixSettings,
  FixStep,
} from '../../../core/fix/typed/fix-types.mts';
import { TYPESCRIPT_RECIPES } from './recipes/typescript-recipes.mjs';
import { fixTargets } from './fix-targets.mts';
import { type KnipFixSettings, knipFixStep } from './dead-code/knip-fix-step.mts';
import { codeFixStep } from './code-fixes/code-fix-step.mts';
import { eslintFixStep } from './eslint-fix.mts';
import { prettierFixStep } from './prettier-fix.mts';
import type { Layout } from './typed/fix-views.mts';

type HeadPolicy = { readonly tools?: { readonly eslint?: unknown; readonly knip?: unknown } };
type PolicySettings = Omit<KnipFixSettings, 'headPolicy' | 'layout'> & {
  readonly headPolicy: HeadPolicy;
  readonly layout: Layout;
  readonly eslintSettings: unknown;
};
type StepInput = {
  readonly decodable: readonly FixFile[];
  readonly targets: Targets;
  readonly before: Bytes;
  readonly mergeBaseSha: string | undefined;
};
type Targets = {
  readonly isEslintFile: (name: string) => boolean;
  readonly isPrettierFile: (name: string) => boolean;
};

const headPolicyEnvironment: (policyFile: string) => NodeJS.ProcessEnv =
  untypedHeadPolicyEnvironment;
const resolveHeadPolicy: () => HeadPolicy = untypedResolveHeadPolicy;
const withHeadPolicyFile: (
  policy: HeadPolicy,
  run: (policyFile: string) => FixOutcome,
) => FixOutcome = untypedWithHeadPolicyFile;
const resolveLayoutFor: (policy: HeadPolicy) => Layout = untypedResolveLayoutFor;
const typescriptRecipes: readonly unknown[] = TYPESCRIPT_RECIPES;
const sharedRecipes: readonly unknown[] = SHARED_RECIPES;
function isManifest(name: string): boolean {
  return /(?:^|\/)package\.json$/u.test(name);
}

function findingsField(steps: readonly FixStep[]): { readonly fixedFindings?: readonly string[] } {
  const fixedFindings = steps.flatMap((step) => step.fixedFindings ?? []);
  return fixedFindings.length === 0 ? {} : { fixedFindings };
}

function presetOf(config: unknown): string {
  if (typeof config !== 'object' || config === null || !('preset' in config)) {
    return 'typescript';
  }
  return typeof config.preset === 'string' ? config.preset : 'typescript';
}

function recipeRun({
  settings,
  files,
  accepts,
  inputs,
}: {
  readonly settings: PolicySettings;
  readonly files: readonly FixFile[];
  readonly accepts: (name: string) => boolean;
  readonly inputs: object;
}): RecipeResult {
  return runRecipes({
    projectRoot: settings.projectRoot,
    files,
    recipes: [...typescriptRecipes, ...sharedRecipes],
    writer: settings.writer,
    preset: presetOf(settings.config),
    selectedRules: settings.selectedRules,
    accepts,
    inputs: {
      ...inputs,
      layout: settings.layout,
      headPolicy: settings.headPolicy,
      policyEnvironment: settings.policyEnvironment,
    },
  });
}

function fixSteps(
  settings: PolicySettings,
  { decodable, targets, before, mergeBaseSha }: StepInput,
): FixStep[] {
  const eslintFiles = decodable.filter(({ path: name }) => targets.isEslintFile(name));
  const formatted = decodable.filter(({ path: name }) => targets.isPrettierFile(name));
  return [
    codeFixStep(settings, eslintFiles),
    knipFixStep(
      settings,
      decodable.filter(({ path: name }) => targets.isEslintFile(name) || isManifest(name)),
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

function fixWithPolicy(settings: PolicySettings): FixOutcome {
  const { repositoryRoot, projectRoot, baseRef, scope, layout, selectedRules } = settings;
  const targets = fixTargets(layout);
  function accepts(name: string): boolean {
    return (
      !layout.isExcluded(name) &&
      (targets.isEslintFile(name) || targets.isPrettierFile(name) || isManifest(name))
    );
  }
  const { comparison, files, links } = collectFixFiles({
    repositoryRoot,
    projectRoot,
    baseRef,
    scope,
    allFiles: settings.allFiles,
    accepts,
  });
  const before = readBytes(projectRoot, files);
  const shared = sharedInputs({ projectRoot, headPolicy: settings.headPolicy, selectedRules });
  const recipes = recipeRun({ settings, files, accepts, inputs: shared.inputs });
  const { files: decodable, undecodable } = splitByEncoding(projectRoot, recipes.files);
  const steps = fixSteps(settings, {
    decodable,
    targets,
    before,
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

function policyOf(settings: { readonly headPolicy: unknown }): HeadPolicy {
  return typeof settings.headPolicy === 'object' && settings.headPolicy !== null
    ? settings.headPolicy
    : resolveHeadPolicy();
}

export function fixTypeScript(
  settings: Omit<FixSettings, 'selectedRules'> & { readonly selectedRules?: readonly string[] },
): FixOutcome {
  const headPolicy = policyOf(settings);
  return withHeadPolicyFile(headPolicy, (policyFile) =>
    fixWithPolicy({
      ...settings,
      selectedRules: settings.selectedRules ?? [],
      headPolicy,
      layout: resolveLayoutFor(headPolicy),
      eslintSettings: headPolicy.tools?.eslint,
      knipSettings: headPolicy.tools?.knip,
      policyEnvironment: headPolicyEnvironment(policyFile),
    }),
  );
}
