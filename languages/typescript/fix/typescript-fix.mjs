import path from 'node:path';
import {
  headPolicyEnvironment,
  resolveHeadPolicy,
  withHeadPolicyFile,
} from '../preset/head-policy.mjs';
import { resolveLayoutFor } from '../preset/layout.mjs';
import {
  collectFixFiles,
  readBytes,
  rewrittenPaths,
  splitByEncoding,
} from '../../../core/fix/common/fix-files.mjs';
import { linkNote, undecodableNote } from '../../../core/fix/common/fix-notes.mjs';
import {
  prettierExclusions,
  prettierExtensions,
  typescriptExtensions,
} from '../../../core/fix/extensions.mjs';
import { eslintFixStep } from './eslint-fix.mjs';
import { prettierFixStep } from './prettier-fix.mjs';

function extensionOf(name) {
  return path.posix.extname(name).toLowerCase();
}

function eslintExtensionsFor(layout) {
  return layout.javascript
    ? new Set(layout.extensions.map((extension) => `.${extension}`))
    : typescriptExtensions;
}

function isPrettierFile(name) {
  return (
    prettierExtensions.has(extensionOf(name)) &&
    !prettierExclusions.some((pattern) => pattern.test(name))
  );
}

function fixWithPolicy(settings) {
  const { repositoryRoot, projectRoot, baseRef, layout } = settings;
  const eslintExtensions = eslintExtensionsFor(layout);
  function isEslintFile(name) {
    return eslintExtensions.has(extensionOf(name));
  }
  const { comparison, files, links } = collectFixFiles({
    repositoryRoot,
    projectRoot,
    baseRef,
    accepts: (name) => !layout.isExcluded(name) && (isEslintFile(name) || isPrettierFile(name)),
  });
  const before = readBytes(projectRoot, files);
  const { files: decodable, undecodable } = splitByEncoding(projectRoot, files);
  const steps = [
    eslintFixStep(
      settings,
      decodable.filter(({ path: name }) => isEslintFile(name)),
    ),
    prettierFixStep(
      settings,
      decodable.filter(({ path: name }) => isPrettierFile(name)),
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
      layout: resolveLayoutFor(headPolicy),
      policyEnvironment: headPolicyEnvironment(policyFile),
    }),
  );
}
