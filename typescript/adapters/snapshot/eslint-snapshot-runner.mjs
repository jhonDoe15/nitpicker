import { spawnSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { normalizeEslintResults } from '../diff/eslint-runner.mjs';
import { linkPolicyFile } from '../policy-links.mjs';

const MAX_ESLINT_OUTPUT_BYTES = 50 * 1024 * 1024;
const DEFAULT_ESLINT_TIMEOUT_MS = 4 * 60 * 1000;
const TRUSTED_PROJECT_ROOT = realpathSync(path.resolve(import.meta.dirname, '../..'));
const WRAPPER_CONFIG_PATH = path.join(import.meta.dirname, '../diff/eslint-config-wrapper.mjs');

/**
 * Snapshot mode analyzes the trusted, already-installed checkout directly, unlike the diff
 * adapter, which analyzes ephemeral Git worktrees carved out of untrusted refs. There is no
 * second snapshot to isolate from and no borrowed `node_modules` to symlink in, so this runner
 * skips the worktree sandboxing and dependency-linking the diff adapter requires. Policy files
 * are still linked into the project root, and the config is loaded through the shared wrapper,
 * so typed linting resolves the policy TypeScript project against the analyzed sources.
 */
try {
  const options = parseArguments(process.argv.slice(2));
  const findings = runEslint(options);
  process.stdout.write(`${JSON.stringify({ findings })}\n`);
} catch (error) {
  process.stderr.write(
    `ESLint snapshot adapter failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}

function runEslint({
  analyzerName,
  projectRoot,
  configRelativePath,
  patterns,
  policyFiles,
  timeoutMs,
}) {
  const installedPolicyFiles = installPolicyFiles(projectRoot, policyFiles);
  try {
    return runInstalledEslint({
      analyzerName,
      projectRoot,
      configRelativePath,
      patterns,
      timeoutMs,
      projectConfigPath: installedPolicyFiles.at(0)?.targetPath,
    });
  } finally {
    for (const installedFile of installedPolicyFiles.reverse()) {
      installedFile.remove();
    }
  }
}

function installPolicyFiles(projectRoot, policyFiles) {
  const installedFiles = [];
  try {
    for (const [index, relativePath] of policyFiles.entries()) {
      installedFiles.push(
        linkPolicyFile(
          path.join(projectRoot, relativePath),
          path.join(
            projectRoot,
            `.quality-snapshot-policy-${String(index)}${path.extname(relativePath)}`,
          ),
        ),
      );
    }
    return installedFiles;
  } catch (error) {
    for (const installedFile of installedFiles.reverse()) {
      installedFile.remove();
    }
    throw error;
  }
}

function runInstalledEslint({
  analyzerName,
  projectRoot,
  configRelativePath,
  patterns,
  timeoutMs,
  projectConfigPath,
}) {
  const eslintCliPath = path.join(projectRoot, 'node_modules/eslint/bin/eslint.js');
  const result = spawnSync(
    process.execPath,
    [eslintCliPath, '--config', WRAPPER_CONFIG_PATH, '--format', 'json', '--no-color', ...patterns],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        QUALITY_DIFF_ESLINT_POLICY_CONFIG: path.join(projectRoot, configRelativePath),
        QUALITY_DIFF_ESLINT_PROJECT_ROOT: projectRoot,
        QUALITY_DIFF_ESLINT_PROJECT_CONFIG: projectConfigPath ?? '',
      },
      encoding: 'utf8',
      maxBuffer: MAX_ESLINT_OUTPUT_BYTES,
      timeout: timeoutMs,
      killSignal: 'SIGTERM',
    },
  );

  if (result.error !== undefined) {
    if (result.error.code === 'ETIMEDOUT') {
      throw new Error(`ESLint timed out after ${String(timeoutMs)} ms`, { cause: result.error });
    }
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`ESLint exited with ${String(result.status)}: ${detail}`);
  }

  let eslintResults;
  try {
    eslintResults = JSON.parse(result.stdout);
  } catch (error) {
    const detail = result.stderr.trim();
    const suffix = detail.length === 0 ? '' : `: ${detail}`;
    throw new Error(`ESLint did not produce valid JSON${suffix}`, { cause: error });
  }
  return normalizeEslintResults({ value: eslintResults, projectRoot, analyzerName });
}

function parseArguments(arguments_) {
  const values = new Map();
  const patterns = [];
  const policyFiles = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (name === '--pattern') {
      if (value === undefined) {
        throw new Error('--pattern requires a value');
      }
      patterns.push(validatePattern(value));
      index += 1;
      continue;
    }
    if (name === '--policy-file') {
      if (value === undefined) {
        throw new Error('--policy-file requires a value');
      }
      policyFiles.push(normalizedRelativePath(value, '--policy-file'));
      index += 1;
      continue;
    }
    if (
      name !== '--analyzer-name' &&
      name !== '--project-root' &&
      name !== '--config' &&
      name !== '--timeout-ms'
    ) {
      throw new Error(`Unknown ESLint snapshot adapter argument: ${name ?? '<missing>'}`);
    }
    if (value === undefined) {
      throw new Error(`${name} requires a value`);
    }
    values.set(name, value);
    index += 1;
  }

  if (patterns.length === 0) {
    throw new Error('ESLint snapshot adapter requires at least one --pattern');
  }

  return {
    analyzerName: requiredArgument(values, '--analyzer-name'),
    projectRoot: validatedProjectRoot(requiredArgument(values, '--project-root')),
    configRelativePath: normalizedRelativePath(requiredArgument(values, '--config'), '--config'),
    timeoutMs: positiveInteger(
      Number(values.get('--timeout-ms') ?? DEFAULT_ESLINT_TIMEOUT_MS),
      '--timeout-ms',
    ),
    patterns,
    policyFiles,
  };
}

function validatedProjectRoot(value) {
  const canonicalRoot = realpathSync(path.resolve(value));
  if (canonicalRoot !== TRUSTED_PROJECT_ROOT) {
    throw new Error('--project-root must be the project checkout containing this adapter');
  }
  if (!statSync(canonicalRoot).isDirectory()) {
    throw new Error('--project-root must be a directory');
  }
  return canonicalRoot;
}

function normalizedRelativePath(value, context) {
  const normalizedPath = path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (
    normalizedPath.length === 0 ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    path.posix.isAbsolute(normalizedPath) ||
    /^[A-Za-z]:\//.test(normalizedPath)
  ) {
    throw new Error(`${context} must stay within the project root`);
  }
  return normalizedPath;
}

function validatePattern(value) {
  const normalizedPattern = value.replaceAll('\\', '/');
  if (
    normalizedPattern.length === 0 ||
    path.posix.isAbsolute(normalizedPattern) ||
    /^[A-Za-z]:\//.test(normalizedPattern) ||
    normalizedPattern.split('/').includes('..')
  ) {
    throw new Error('--pattern must stay within the project root');
  }
  return normalizedPattern;
}

function requiredArgument(values, name) {
  const value = values.get(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function positiveInteger(value, context) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${context} must be a positive integer`);
  }
  return value;
}
