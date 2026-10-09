import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT, resolveTool } from '../../adapters/tool-resolution.mjs';
import { linkPolicyFile } from '../../adapters/policy-links.mjs';
import { eslintChecks, staticChecks } from '../../preset/quality-checks.mjs';
import { resolveLayout } from '../../preset/layout.mjs';
import {
  headPolicyEnvironment,
  resolveHeadPolicy,
  withHeadPolicyFile,
} from '../../preset/head-policy.mjs';
import { policyTransformFor } from '../../preset/tool-configs.mjs';
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

/** Fixes the changed files that the head policy does not exclude, with the policy's layout. */
export function fixWorkingTree({ headPolicy = resolveHeadPolicy(), ...options }) {
  return withHeadPolicyFile(headPolicy, (policyFile) =>
    fixWithPolicy({
      ...options,
      layout: resolveLayout(headPolicy.layout, headPolicy.exclude),
      policyEnvironment: headPolicyEnvironment(policyFile),
    }),
  );
}

function fixWithPolicy({
  repositoryRoot,
  projectRoot,
  baseRef,
  executeFixCommand,
  layout,
  policyEnvironment,
}) {
  const { comparison, changes } = collectWorkingTreeChanges({
    repositoryRoot,
    projectRoot,
    baseRef,
  });
  const files = changes.filter(({ isFile, path: name }) => isFile && !layout.isExcluded(name));
  const eslintFiles = files.filter(({ path: name }) =>
    typescriptExtensions.has(path.posix.extname(name).toLowerCase()),
  );
  const prettierFiles = files.filter(
    ({ path: name }) =>
      prettierExtensions.has(path.posix.extname(name).toLowerCase()) &&
      !prettierExclusions.some((pattern) => pattern.test(name)),
  );
  const before = new Map(
    files.map(({ path: name }) => [name, readFileSync(path.join(projectRoot, name))]),
  );

  const toolErrors = [];
  if (eslintFiles.length > 0) {
    let linked;
    let failure;
    try {
      linked = linkPolicyFile(
        path.join(PACKAGE_ROOT, eslintPolicy.policyFiles[0]),
        path.join(projectRoot, '.nitpicker-fix-tsconfig.json'),
        policyTransformFor(eslintPolicy.policyFiles[0], layout, { projectRoot }),
      );
      run(
        'eslint-fix',
        resolveTool('eslint', { bin: 'bin/eslint.js' }).binPath,
        [
          '--config',
          path.join(PACKAGE_ROOT, 'adapters/diff/eslint-config-wrapper.mjs'),
          '--fix',
          '--no-warn-ignored',
          '--',
          ...eslintFiles.map(({ path: name }) => `./${name}`),
        ],
        projectRoot,
        [0, 1],
        {
          ...policyEnvironment,
          NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(
            PACKAGE_ROOT,
            eslintPolicy.configRelativePath,
          ),
          NITPICKER_DIFF_ESLINT_PROJECT_ROOT: projectRoot,
          NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: linked.targetPath,
        },
        undefined,
        executeFixCommand,
      );
    } catch (error) {
      failure = error;
    }
    try {
      linked?.remove();
    } catch (error) {
      failure ??= error;
    }
    if (failure !== undefined) {
      toolErrors.push(fixerError('eslint-fix', failure));
    }
  }

  const baseSources = readBaseFiles({
    repositoryRoot,
    mergeBaseSha: comparison.mergeBaseSha,
    files: prettierFiles,
  });
  const existing = prettierFiles.filter(({ path: name }) => baseSources.get(name) !== undefined);
  let cleanPaths = new Set();
  if (existing.length > 0) {
    const result = run(
      'prettier-base-check',
      path.join(import.meta.dirname, 'prettier-base-runner.mjs'),
      [path.join(PACKAGE_ROOT, prettierPolicy.configRelativePath)],
      projectRoot,
      [0],
      {},
      JSON.stringify({
        files: existing.map((file) => ({
          path: file.path,
          source: baseSources.get(file.path),
          filePath: path.join(projectRoot, file.basePath),
        })),
      }),
      executeFixCommand,
    );
    let report;
    try {
      report = JSON.parse(result.stdout);
    } catch (error) {
      throw new Error('Prettier base check returned invalid JSON', { cause: error });
    }
    if (
      !Array.isArray(report?.results) ||
      report.results.length !== existing.length ||
      report.results.some(({ error }) => error)
    ) {
      throw new Error(`Prettier base check failed: ${JSON.stringify(report)}`);
    }
    cleanPaths = new Set(report.results.filter(({ clean }) => clean).map(({ path: name }) => name));
  }
  const safeFiles = prettierFiles.filter(
    ({ path: name }) => baseSources.get(name) === undefined || cleanPaths.has(name),
  );
  if (safeFiles.length > 0) {
    try {
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
    } catch (error) {
      toolErrors.push(fixerError('prettier-fix', error));
    }
  }
  const fixedFiles = files
    .filter(
      ({ path: name }) => !before.get(name).equals(readFileSync(path.join(projectRoot, name))),
    )
    .map(({ path: name }) => name);
  return { fixedFiles, toolErrors };
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
