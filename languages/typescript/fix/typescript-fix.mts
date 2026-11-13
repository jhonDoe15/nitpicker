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
import { fixTargets } from './fix-targets.mjs';
import { type FixFile, type KnipFixSettings, knipFixStep } from './dead-code/knip-fix-step.mts';
import { codeFixStep } from './code-fixes/code-fix-step.mjs';
import { eslintFixStep } from './eslint-fix.mjs';
import { prettierFixStep } from './prettier-fix.mjs';

type Layout = { readonly isExcluded: (name: string) => boolean };
type FixSettings = KnipFixSettings & {
  readonly repositoryRoot: string;
  readonly baseRef: unknown;
  readonly scope: unknown;
  readonly layout: Layout;
  readonly eslintSettings: unknown;
  readonly selectedRules: readonly string[];
};
type Step = {
  readonly toolErrors: readonly unknown[];
  readonly notes: readonly string[];
  readonly fixedFindings?: readonly unknown[];
};
type TypeScriptFixOptions = Omit<
  FixSettings,
  'layout' | 'knipSettings' | 'eslintSettings' | 'policyEnvironment' | 'selectedRules'
> & {
  readonly headPolicy?: { readonly tools?: { readonly eslint?: unknown; readonly knip?: unknown } };
  readonly selectedRules?: readonly string[];
};

function isManifest(name: string): boolean {
  return /(?:^|\/)package\.json$/u.test(name);
}

function findingsField(steps: readonly Step[]) {
  const fixedFindings = steps.flatMap((step) => step.fixedFindings ?? []);
  return fixedFindings.length === 0 ? {} : { fixedFindings };
}

function fixWithPolicy(settings: FixSettings) {
  const { repositoryRoot, projectRoot, baseRef, scope, layout } = settings;
  const { isEslintFile, isPrettierFile } = fixTargets(layout);
  const { comparison, files, links } = collectFixFiles({
    repositoryRoot,
    projectRoot,
    baseRef,
    scope,
    accepts: (name: string) =>
      !layout.isExcluded(name) && (isEslintFile(name) || isPrettierFile(name) || isManifest(name)),
  });
  const before = readBytes(projectRoot, files);
  const { files: decodable, undecodable } = splitByEncoding(projectRoot, files);
  const formatted = decodable.filter(({ path: name }: FixFile) => isPrettierFile(name));
  const steps = [
    codeFixStep(
      settings,
      decodable.filter(({ path: name }: FixFile) => isEslintFile(name)),
    ),
    knipFixStep(
      settings,
      decodable.filter(({ path: name }: FixFile) => isEslintFile(name) || isManifest(name)),
    ),
    eslintFixStep(
      settings,
      decodable.filter(({ path: name }: FixFile) => isEslintFile(name)),
    ),
    prettierFixStep(
      settings,
      settings.selectedRules.length === 0
        ? formatted
        : changedFiles(projectRoot, formatted, before),
      comparison.mergeBaseSha,
    ),
  ];
  return {
    fixedFiles: rewrittenPaths(projectRoot, files, before),
    toolErrors: steps.flatMap(({ toolErrors }) => toolErrors),
    ...findingsField(steps),
    notes: [
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
      layout: resolveLayoutFor(headPolicy),
      eslintSettings: headPolicy.tools?.eslint,
      knipSettings: headPolicy.tools?.knip,
      policyEnvironment: headPolicyEnvironment(policyFile),
    }),
  );
}
