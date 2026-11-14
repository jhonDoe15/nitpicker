import {
  headPolicyEnvironment as untypedHeadPolicyEnvironment,
  resolveHeadPolicy as untypedResolveHeadPolicy,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from '../preset/head-policy.mjs';
import { resolveLayoutFor as untypedResolveLayoutFor } from '../preset/layout.mjs';
import {
  changedFiles as untypedChangedFiles,
  collectFixFiles as untypedCollectFixFiles,
  readBytes as untypedReadBytes,
  rewrittenPaths as untypedRewrittenPaths,
  splitByEncoding as untypedSplitByEncoding,
} from '../../../core/fix/common/fix-files.mjs';
import {
  linkNote as untypedLinkNote,
  undecodableNote as untypedUndecodableNote,
} from '../../../core/fix/common/fix-notes.mjs';
import { runRecipes as untypedRunRecipes } from '../../../core/fix/engine/run-recipes.mjs';
import { SHARED_RECIPES } from '../../../core/fix/recipes/shared-recipes.mjs';
import { sharedInputs as untypedSharedInputs } from '../../../core/fix/recipes/shared-inputs.mjs';
import type {
  FixFile,
  FixOutcome,
  FixSettings,
  FixStep,
} from '../../../core/fix/typed/fix-types.mts';
import { TYPESCRIPT_RECIPES } from './recipes/typescript-recipes.mjs';
import { fixTargets as untypedFixTargets } from './fix-targets.mjs';
import { type KnipFixSettings, knipFixStep } from './dead-code/knip-fix-step.mts';
import { codeFixStep as untypedCodeFixStep } from './code-fixes/code-fix-step.mjs';
import { eslintFixStep as untypedEslintFixStep } from './eslint-fix.mjs';
import { prettierFixStep as untypedPrettierFixStep } from './prettier-fix.mjs';

type Layout = { readonly isExcluded: (name: string) => boolean };
type HeadPolicy = { readonly tools?: { readonly eslint?: unknown; readonly knip?: unknown } };
type PolicySettings = Omit<KnipFixSettings, 'headPolicy' | 'layout'> & {
  readonly headPolicy: HeadPolicy;
  readonly layout: Layout;
  readonly eslintSettings: unknown;
};
type Bytes = ReadonlyMap<string, Buffer>;
type RecipeResult = FixStep & { readonly files: readonly FixFile[] };
type SharedInputs = { readonly inputs: object; readonly toolErrors: readonly unknown[] };
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
const fixTargets: (layout: Layout) => Targets = untypedFixTargets;
const collectFixFiles: (options: {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly baseRef: unknown;
  readonly scope: unknown;
  readonly allFiles: boolean;
  readonly accepts: (name: string) => boolean;
}) => {
  readonly comparison: { readonly mergeBaseSha: string | undefined };
  readonly files: readonly FixFile[];
  readonly links: readonly string[];
} = untypedCollectFixFiles;
const readBytes: (projectRoot: string, files: readonly FixFile[]) => Bytes = untypedReadBytes;
const changedFiles: (
  projectRoot: string,
  files: readonly FixFile[],
  before: Bytes,
) => readonly FixFile[] = untypedChangedFiles;
const rewrittenPaths: (
  projectRoot: string,
  files: readonly FixFile[],
  before: Bytes,
) => readonly string[] = untypedRewrittenPaths;
const splitByEncoding: (
  projectRoot: string,
  files: readonly FixFile[],
) => { readonly files: readonly FixFile[]; readonly undecodable: readonly string[] } =
  untypedSplitByEncoding;
const linkNote: (paths: readonly string[]) => string[] = untypedLinkNote;
const undecodableNote: (paths: readonly string[]) => string[] = untypedUndecodableNote;
const typescriptRecipes: readonly unknown[] = TYPESCRIPT_RECIPES;
const sharedRecipes: readonly unknown[] = SHARED_RECIPES;
const runRecipes: (options: {
  readonly projectRoot: string;
  readonly files: readonly FixFile[];
  readonly recipes: readonly unknown[];
  readonly writer: FixSettings['writer'];
  readonly preset: string;
  readonly selectedRules: readonly string[];
  readonly accepts: (name: string) => boolean;
  readonly inputs: object;
}) => RecipeResult = untypedRunRecipes;
const sharedInputs: (options: {
  readonly projectRoot: string;
  readonly headPolicy: object | undefined;
  readonly selectedRules: readonly string[];
}) => SharedInputs = untypedSharedInputs;
const codeFixStep: (settings: object, files: readonly FixFile[]) => FixStep = untypedCodeFixStep;
const eslintFixStep: (settings: object, files: readonly FixFile[]) => FixStep =
  untypedEslintFixStep;
const prettierFixStep: (
  settings: object,
  files: readonly FixFile[],
  mergeBaseSha: string | undefined,
) => FixStep = untypedPrettierFixStep;

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
