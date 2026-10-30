import { eslintChecks, staticChecks } from '../../languages/typescript/preset/quality-checks.mjs';
import {
  resolveHeadPolicy,
  withHeadPolicyFile,
  headPolicyEnvironment,
  usesLayeredPrettier,
} from '../../languages/typescript/preset/head-policy.mjs';
import { resolveLayoutFor } from '../../languages/typescript/preset/layout.mjs';
import { collectWorkingTreeChanges, readBaseFiles } from './changes.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { prettierExtensions, prettierExclusions, typescriptExtensions } from './extensions.mjs';
import { linkPolicyFile } from '../tooling/policy-links.mjs';
import { PACKAGE_ROOT, resolveTool } from '../tooling/tool-resolution.mjs';
import { layoutTransformFor } from '../../languages/typescript/preset/tool-configs.mjs';
import { runFixCommand, fixerError } from './common/fix-command.mjs';
import { rewrittenPaths } from './common/fix-files.mjs';
import { languageFixers } from './language-fixers.mjs';
import {
  PROJECT_LAYER_VARIABLE,
  projectLayerValue,
} from '../../languages/typescript/adapters/lint-engine/project-layer.mjs';

const eslintPolicy = eslintChecks.find(({ name }) => name === 'eslint-lint');

const prettierPolicy = staticChecks.find(({ name }) => name === 'prettier-format');

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

function spawnEnvironment(baseEnvironment, overrides = {}) {
  if (baseEnvironment === undefined && Object.keys(overrides).length === 0) {
    return undefined;
  }
  return { ...baseEnvironment, ...overrides };
}

export function spawnInvocation(
  { command, args, cwd, input, environment, shell = false, timeout },
  baseEnvironment,
  spawn = spawnSync,
) {
  return spawn(command, args, {
    cwd,
    input,
    shell,
    timeout,
    env: spawnEnvironment(baseEnvironment, environment),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
}

export function fixWorkingTree(options) {
  const settings = {
    ...options,
    executeFixCommand: (invocation) =>
      options.executeFixCommand?.(invocation) ?? spawnInvocation(invocation, options.environment),
  };
  const fixer = languageFixers[settings.config?.preset];
  return fixer === undefined ? fixTypeScript(settings) : fixer(settings);
}

function fixTypeScript({ headPolicy = resolveHeadPolicy(), ...options }) {
  return withHeadPolicyFile(headPolicy, (policyFile) =>
    fixWithPolicy({
      ...options,
      layout: resolveLayoutFor(headPolicy),
      eslintSettings: headPolicy.tools?.eslint,
      policyEnvironment: headPolicyEnvironment(policyFile),
    }),
  );
}

function fixWithPolicy(settings) {
  const { repositoryRoot, projectRoot, baseRef, layout } = settings;
  const { comparison, changes } = collectWorkingTreeChanges({
    repositoryRoot,
    projectRoot,
    baseRef,
  });
  const files = changes.filter(({ isFile, path: name }) => isFile && !layout.isExcluded(name));
  const before = new Map(
    files.map(({ path: name }) => [name, readFileSync(path.join(projectRoot, name))]),
  );
  const eslintFiles = files.filter(({ path: name }) =>
    eslintExtensionsFor(layout).has(path.posix.extname(name).toLowerCase()),
  );
  const prettierFiles = files.filter(
    ({ path: name }) =>
      prettierExtensions.has(path.posix.extname(name).toLowerCase()) &&
      !prettierExclusions.some((pattern) => pattern.test(name)),
  );
  const toolErrors = [
    ...eslintFixErrors(settings, eslintFiles),
    ...prettierFixErrors(settings, prettierFiles, comparison.mergeBaseSha),
  ];
  return { fixedFiles: rewrittenPaths(projectRoot, files, before), toolErrors };
}

function eslintExtensionsFor(layout) {
  return layout.javascript
    ? new Set(layout.extensions.map((extension) => `.${extension}`))
    : typescriptExtensions;
}

function eslintFixErrors(settings, eslintFiles) {
  if (eslintFiles.length === 0) {
    return [];
  }
  const attempt = attemptEslintFix(settings, eslintFiles);
  const removalFailure = removeLinkedFile(attempt.linked);
  const failure = attempt.failure ?? removalFailure;
  return failure === undefined ? [] : [fixerError('eslint-fix', failure)];
}

function attemptEslintFix(settings, eslintFiles) {
  const { projectRoot, layout } = settings;
  let linked;
  try {
    linked = linkPolicyFile(
      path.join(PACKAGE_ROOT, eslintPolicy.policyFiles[0]),
      path.join(projectRoot, '.nitpicker-fix-tsconfig.json'),
      layoutTransformFor(eslintPolicy.policyFiles[0], layout),
    );
    runEslintFix(settings, eslintFiles, linked);
    return { linked };
  } catch (error) {
    return { linked, failure: error };
  }
}

function removeLinkedFile(linked) {
  try {
    linked?.remove();
    return undefined;
  } catch (error) {
    return error;
  }
}

function runEslintFix(settings, eslintFiles, linked) {
  const { projectRoot, policyEnvironment, executeFixCommand } = settings;
  run({
    operation: 'eslint-fix',
    script: resolveTool('eslint', { bin: 'bin/eslint.js' }).binPath,
    args: [
      '--config',
      path.join(PACKAGE_ROOT, 'languages/typescript/adapters/eslint-wrapper.config.mjs'),
      '--fix',
      '--no-warn-ignored',
      '--',
      ...eslintFiles.map(({ path: name }) => `./${name}`),
    ],
    cwd: projectRoot,
    acceptedStatuses: [0, 1],
    environment: {
      ...policyEnvironment,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(PACKAGE_ROOT, eslintPolicy.configRelativePath),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: projectRoot,
      NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: linked.targetPath,
      [PROJECT_LAYER_VARIABLE]: projectLayerValue(settings.eslintSettings, {
        liveProjectRoot: projectRoot,
        addsRules: true,
      }),
    },
    input: undefined,
    executeFixCommand,
  });
}

function prettierFixErrors(settings, prettierFiles, mergeBaseSha) {
  const baseSources = readBaseFiles({
    repositoryRoot: settings.repositoryRoot,
    mergeBaseSha,
    files: prettierFiles,
  });
  const cleanPaths = baseCleanPaths(settings, prettierFiles, baseSources);
  const safeFiles = prettierFiles.filter(
    ({ path: name }) => baseSources.get(name) === undefined || cleanPaths.has(name),
  );
  return safeFiles.length > 0 ? writePrettier(settings, safeFiles) : [];
}

function baseCleanPaths(settings, prettierFiles, baseSources) {
  const existing = prettierFiles.filter(({ path: name }) => baseSources.get(name) !== undefined);
  if (existing.length === 0) {
    return new Set();
  }
  const report = parseBaseCheck(runBaseCheck(settings, existing, baseSources), existing.length);
  return new Set(report.results.filter(({ clean }) => clean).map(({ path: name }) => name));
}

function runBaseCheck(
  { projectRoot, policyEnvironment, executeFixCommand },
  existing,
  baseSources,
) {
  return run({
    operation: 'prettier-base-check',
    script: path.join(import.meta.dirname, 'prettier-base-runner.mjs'),
    args: [path.join(PACKAGE_ROOT, prettierPolicy.configRelativePath)],
    cwd: projectRoot,
    acceptedStatuses: [0],
    environment: policyEnvironment,
    input: JSON.stringify({
      liveProjectRoot: projectRoot,
      files: existing.map((file) => ({
        path: file.path,
        source: baseSources.get(file.path),
        filePath: path.join(projectRoot, file.basePath),
      })),
    }),
    executeFixCommand,
  });
}

function parseBaseCheck(result, expectedCount) {
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error('Prettier base check returned invalid JSON', { cause: error });
  }
  if (
    !Array.isArray(report?.results) ||
    report.results.length !== expectedCount ||
    report.results.some(({ error }) => error)
  ) {
    throw new Error(`Prettier base check failed: ${JSON.stringify(report)}`);
  }
  return report;
}

function writePrettier(settings, safeFiles) {
  try {
    if (usesLayeredPrettier(settings.policyEnvironment)) {
      writeLayeredPrettier(settings, safeFiles);
      return [];
    }
    writePolicyPrettier(settings, safeFiles);
    return [];
  } catch (error) {
    return [fixerError('prettier-fix', error)];
  }
}

function writeLayeredPrettier({ projectRoot, policyEnvironment, executeFixCommand }, safeFiles) {
  run({
    operation: 'prettier-fix',
    script: path.join(import.meta.dirname, 'prettier-write-runner.mjs'),
    args: [
      path.join(PACKAGE_ROOT, prettierPolicy.configRelativePath),
      path.join(PACKAGE_ROOT, prettierPolicy.ignoreRelativePath),
    ],
    cwd: projectRoot,
    acceptedStatuses: [0],
    environment: policyEnvironment,
    input: JSON.stringify({ projectRoot, files: safeFiles.map(({ path: name }) => name) }),
    executeFixCommand,
  });
}

function writePolicyPrettier({ projectRoot, policyEnvironment, executeFixCommand }, safeFiles) {
  run({
    operation: 'prettier-fix',
    script: resolveTool('prettier', { bin: 'bin/prettier.cjs' }).binPath,
    args: [
      '--config',
      path.join(PACKAGE_ROOT, prettierPolicy.configRelativePath),
      '--ignore-path',
      path.join(PACKAGE_ROOT, prettierPolicy.ignoreRelativePath),
      '--no-editorconfig',
      '--write',
      '--',
      ...safeFiles.map(({ path: name }) => `./${name}`),
    ],
    cwd: projectRoot,
    acceptedStatuses: [0],
    environment: policyEnvironment,
    input: undefined,
    executeFixCommand,
  });
}

function run({ script, args, ...invocation }) {
  return runFixCommand({ ...invocation, command: process.execPath, args: [script, ...args] });
}
