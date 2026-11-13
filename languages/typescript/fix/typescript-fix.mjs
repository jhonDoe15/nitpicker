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
import { eslintFixStep } from './eslint-fix.mjs';
import { prettierFixStep } from './prettier-fix.mjs';

function fixWithPolicy(settings) {
  const { repositoryRoot, projectRoot, baseRef, scope, layout } = settings;
  const { isEslintFile, isPrettierFile } = fixTargets(layout);
  const { comparison, files, links } = collectFixFiles({
    repositoryRoot,
    projectRoot,
    baseRef,
    scope,
    accepts: (name) => !layout.isExcluded(name) && (isEslintFile(name) || isPrettierFile(name)),
  });
  const before = readBytes(projectRoot, files);
  const { files: decodable, undecodable } = splitByEncoding(projectRoot, files);
  const eslint = eslintFixStep(
    settings,
    decodable.filter(({ path: name }) => isEslintFile(name)),
  );
  const formatted = decodable.filter(({ path: name }) => isPrettierFile(name));
  const steps = [
    eslint,
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
    notes: [
      ...steps.flatMap(({ notes }) => notes),
      ...undecodableNote(undecodable),
      ...linkNote(links),
    ],
  };
}

export function fixTypeScript({ headPolicy = resolveHeadPolicy(), ...options }) {
  return withHeadPolicyFile(headPolicy, (policyFile) =>
    fixWithPolicy({
      ...options,
      selectedRules: options.selectedRules ?? [],
      layout: resolveLayoutFor(headPolicy),
      eslintSettings: headPolicy.tools?.eslint,
      policyEnvironment: headPolicyEnvironment(policyFile),
    }),
  );
}
