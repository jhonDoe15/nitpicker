import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT, resolveTool } from '../tooling/tool-resolution.mjs';
import { linkPolicyFile } from '../tooling/policy-links.mjs';
import { eslintChecks, staticChecks } from '../../languages/typescript/preset/quality-checks.mjs';
import { resolveLayoutFor } from '../../languages/typescript/preset/layout.mjs';
import {
  headPolicyEnvironment,
  prettierPrecedence,
  resolveHeadPolicy,
  usesProjectConfig,
  withHeadPolicyFile,
} from '../../languages/typescript/preset/head-policy.mjs';
import { layoutTransformFor } from '../../languages/typescript/preset/tool-configs.mjs';
import { collectWorkingTreeChanges, readBaseFiles } from './changes.mjs';

const eslintPolicy = eslintChecks.find(({ name }) => name === 'eslint-lint');
const prettierPolicy = staticChecks.find(({ name }) => name === 'prettier-format');
const typescriptExtensions = new Set(['.ts', '.mts', '.cts', '.tsx']);
const prettierExtensions = new Set([
  ...typescriptExtensions,
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
  '.md',
  '.mdx',
  '.graphql',
  '.gql',
  '.html',
  '.css',
  '.scss',
  '.less',
]);
const prettierExclusions = [/^(?:coverage|reports|\.stryker-tmp)\//, /^src\/main\/dist\//];

export function fixWorkingTree({ headPolicy = resolveHeadPolicy(), ...options }) {
  return withHeadPolicyFile(headPolicy, (policyFile) =>
    fixWithPolicy({
      ...options,
      layout: resolveLayoutFor(headPolicy),
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
  return { fixedFiles: changedPaths(files, before, projectRoot), toolErrors };
}

function eslintExtensionsFor(layout) {
  return layout.javascript
    ? new Set(layout.extensions.map((extension) => `.${extension}`))
    : typescriptExtensions;
}

function changedPaths(files, before, projectRoot) {
  return files
    .filter(
      ({ path: name }) => !before.get(name).equals(readFileSync(path.join(projectRoot, name))),
    )
    .map(({ path: name }) => name);
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

function runEslintFix({ projectRoot, policyEnvironment, executeFixCommand }, eslintFiles, linked) {
  run(
    'eslint-fix',
    resolveTool('eslint', { bin: 'bin/eslint.js' }).binPath,
    [
      '--config',
      path.join(PACKAGE_ROOT, 'languages/typescript/adapters/eslint-config-wrapper.mjs'),
      '--fix',
      '--no-warn-ignored',
      '--',
      ...eslintFiles.map(({ path: name }) => `./${name}`),
    ],
    projectRoot,
    [0, 1],
    {
      ...policyEnvironment,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(PACKAGE_ROOT, eslintPolicy.configRelativePath),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: projectRoot,
      NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: linked.targetPath,
    },
    undefined,
    executeFixCommand,
  );
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
  return run(
    'prettier-base-check',
    path.join(import.meta.dirname, 'prettier-base-runner.mjs'),
    [path.join(PACKAGE_ROOT, prettierPolicy.configRelativePath)],
    projectRoot,
    [0],
    policyEnvironment,
    JSON.stringify({
      liveProjectRoot: projectRoot,
      files: existing.map((file) => ({
        path: file.path,
        source: baseSources.get(file.path),
        filePath: path.join(projectRoot, file.basePath),
      })),
    }),
    executeFixCommand,
  );
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
    if (usesProjectConfig(prettierPrecedence(settings.policyEnvironment))) {
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
  run(
    'prettier-fix',
    path.join(import.meta.dirname, 'prettier-write-runner.mjs'),
    [
      path.join(PACKAGE_ROOT, prettierPolicy.configRelativePath),
      path.join(PACKAGE_ROOT, prettierPolicy.ignoreRelativePath),
    ],
    projectRoot,
    [0],
    policyEnvironment,
    JSON.stringify({ projectRoot, files: safeFiles.map(({ path: name }) => name) }),
    executeFixCommand,
  );
}

function writePolicyPrettier({ projectRoot, policyEnvironment, executeFixCommand }, safeFiles) {
  run(
    'prettier-fix',
    resolveTool('prettier', { bin: 'bin/prettier.cjs' }).binPath,
    [
      '--config',
      path.join(PACKAGE_ROOT, prettierPolicy.configRelativePath),
      '--ignore-path',
      path.join(PACKAGE_ROOT, prettierPolicy.ignoreRelativePath),
      '--write',
      '--',
      ...safeFiles.map(({ path: name }) => `./${name}`),
    ],
    projectRoot,
    [0],
    policyEnvironment,
    undefined,
    executeFixCommand,
  );
}

function run(
  operation,
  script,
  args,
  cwd,
  acceptedStatuses,
  environment = {},
  input,
  executeFixCommand,
) {
  const invocation = {
    operation,
    command: process.execPath,
    args: [script, ...args],
    cwd,
    acceptedStatuses,
    environment,
    input,
  };
  const result =
    executeFixCommand?.(invocation) ??
    spawnSync(invocation.command, invocation.args, {
      cwd,
      input,
      env: { ...process.env, ...environment },
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
  if (result.error || !acceptedStatuses.includes(result.status)) {
    throw new Error(
      `${operation} failed: ${result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`}`,
    );
  }
  return result;
}

function fixerError(tool, error) {
  return {
    tool,
    snapshot: 'fix',
    message: error instanceof Error ? error.message : String(error),
  };
}
