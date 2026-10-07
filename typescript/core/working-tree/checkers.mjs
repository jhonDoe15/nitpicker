import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { linkPolicyFile } from '../../adapters/policy-links.mjs';
import { POLICY_TYPESCRIPT_CONFIG } from '../../preset/dependency-graph/cruise.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.tsx']);
const PRETTIER_EXTENSIONS = new Set([
  ...TYPESCRIPT_EXTENSIONS,
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
const PRETTIER_EXCLUSIONS = [/^(?:coverage|reports|\.stryker-tmp)\//, /^src\/main\/dist\//];

export function routeChangedFiles(changes) {
  const files = changes.filter(({ isFile }) => isFile);
  return {
    eslintFiles: files.filter(({ path: filePath }) => isTypeScript(filePath)),
    prettierFiles: files.filter(({ path: filePath }) => isPrettierSupported(filePath)),
  };
}

export function createLoggedExecutor({ outputRoot, execute = executeCommand }) {
  const logs = new Map();
  return {
    run(operation, invocation) {
      const result = normalizeResult(execute({ operation, ...invocation }));
      const entries = logs.get(operation) ?? [];
      entries.push({ invocation, result });
      logs.set(operation, entries);
      return result;
    },
    writeLogs() {
      const logsRoot = path.join(outputRoot, 'logs');
      mkdirSync(logsRoot, { recursive: true });
      for (const [operation, entries] of logs) {
        writeFileSync(
          path.join(logsRoot, `${operation}.log`),
          entries.map(renderLogEntry).join('\n'),
        );
      }
    },
  };
}

export function runEslint({ files, fix, projectRoot, toolRoot, executor }) {
  if (files.length === 0) {
    return { findings: [] };
  }
  const operation = fix ? 'eslint-fix' : 'eslint-check';
  const projectConfig = linkPolicyFile(
    path.join(toolRoot, POLICY_TYPESCRIPT_CONFIG),
    path.join(projectRoot, '.quality-working-tree-tsconfig.json'),
  );
  let result;
  try {
    result = executor.run(operation, {
      command: process.execPath,
      args: [
        path.join(toolRoot, 'node_modules/eslint/bin/eslint.js'),
        '--config',
        path.join(toolRoot, 'adapters/diff/eslint-config-wrapper.mjs'),
        '--format',
        'json',
        '--no-warn-ignored',
        ...(fix ? ['--fix'] : []),
        '--',
        ...files.map(({ path: filePath }) => `./${filePath}`),
      ],
      cwd: projectRoot,
      environment: {
        QUALITY_DIFF_ESLINT_POLICY_CONFIG: path.join(import.meta.dirname, 'eslint.config.mjs'),
        QUALITY_DIFF_ESLINT_PROJECT_ROOT: projectRoot,
        QUALITY_DIFF_ESLINT_PROJECT_CONFIG: projectConfig.targetPath,
      },
    });
  } finally {
    projectConfig.remove();
  }
  if (![0, 1].includes(result.status)) {
    return { findings: [], toolError: commandError(operation, result) };
  }
  if (fix) {
    return { findings: [] };
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    return {
      findings: [],
      toolError: {
        tool: 'eslint',
        message: `ESLint did not produce valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
  if (!Array.isArray(report)) {
    return {
      findings: [],
      toolError: { tool: 'eslint', message: 'ESLint JSON output must be an array' },
    };
  }
  return {
    findings: report.flatMap((fileReport) => normalizeEslintFile(fileReport, projectRoot)),
  };
}

export function runPrettier({ files, write, projectRoot, toolRoot, executor }) {
  if (files.length === 0) {
    return { findings: [] };
  }
  const operation = write ? 'prettier-fix' : 'prettier-check';
  const result = executor.run(operation, {
    command: process.execPath,
    args: [
      path.join(toolRoot, 'node_modules/prettier/bin/prettier.cjs'),
      '--config',
      path.join(toolRoot, 'preset/defaults/.prettierrc.json'),
      '--ignore-path',
      path.join(toolRoot, 'preset/defaults/.prettierignore'),
      write ? '--write' : '--list-different',
      '--',
      ...files.map(({ path: filePath }) => `./${filePath}`),
    ],
    cwd: projectRoot,
  });
  const acceptedStatuses = write ? [0] : [0, 1];
  if (!acceptedStatuses.includes(result.status)) {
    return { findings: [], toolError: commandError(operation, result) };
  }
  if (write) {
    return { findings: [] };
  }
  return {
    findings: result.stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((filePath) => ({
        tool: 'prettier',
        rule: 'prettier/prettier',
        path: relativeToolPath(projectRoot, filePath),
        message: 'Format this file with Prettier',
      })),
  };
}

export function checkBasePrettier({ files, projectRoot, toolRoot, executor }) {
  if (files.length === 0) {
    return { cleanPaths: new Set(), toolErrors: [] };
  }
  const result = executor.run('prettier-base-check', {
    command: process.execPath,
    args: [
      path.join(import.meta.dirname, 'prettier-base-runner.mjs'),
      path.join(toolRoot, 'preset/defaults/.prettierrc.json'),
    ],
    cwd: projectRoot,
    input: JSON.stringify({
      files: files.map(({ file, source }) => ({
        path: file.path,
        source,
        filePath: path.join(projectRoot, ...file.basePath.split('/')),
      })),
    }),
  });
  if (result.status !== 0) {
    return {
      cleanPaths: new Set(),
      toolErrors: [commandError('prettier-base-check', result)],
    };
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    return {
      cleanPaths: new Set(),
      toolErrors: [
        {
          tool: 'prettier-base-check',
          message: `Prettier base checker did not produce valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
  if (!Array.isArray(report?.results)) {
    return {
      cleanPaths: new Set(),
      toolErrors: [
        {
          tool: 'prettier-base-check',
          message: 'Prettier base checker JSON must contain a results array',
        },
      ],
    };
  }
  const resultsByPath = new Map(report.results.map((entry) => [entry.path, entry]));
  const cleanPaths = new Set();
  const toolErrors = [];
  for (const { file } of files) {
    const entry = resultsByPath.get(file.path);
    if (entry?.clean === true) {
      cleanPaths.add(file.path);
    } else if (typeof entry?.error === 'string') {
      toolErrors.push({ tool: 'prettier-base-check', path: file.path, message: entry.error });
    } else if (entry?.clean !== false) {
      toolErrors.push({
        tool: 'prettier-base-check',
        path: file.path,
        message: 'Prettier base checker omitted this file',
      });
    }
  }
  return { cleanPaths, toolErrors };
}

function normalizeEslintFile(fileReport, projectRoot) {
  if (typeof fileReport?.filePath !== 'string' || !Array.isArray(fileReport.messages)) {
    throw new TypeError('ESLint JSON output contains an invalid file result');
  }
  const relativePath = relativeToolPath(projectRoot, fileReport.filePath);
  return fileReport.messages
    .filter(({ severity }) => severity > 0)
    .map((message) => ({
      tool: 'eslint',
      rule: message.ruleId ?? (message.fatal === true ? 'eslint/fatal' : 'eslint/unknown'),
      path: relativePath,
      location:
        Number.isInteger(message.line) && Number.isInteger(message.column)
          ? { line: message.line, column: message.column }
          : undefined,
      message: String(message.message),
    }));
}

function isTypeScript(filePath) {
  return TYPESCRIPT_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase());
}

function isPrettierSupported(filePath) {
  return (
    PRETTIER_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase()) &&
    !PRETTIER_EXCLUSIONS.some((pattern) => pattern.test(filePath))
  );
}

function relativeToolPath(projectRoot, filePath) {
  const relativePath = path.relative(projectRoot, path.resolve(projectRoot, filePath));
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Tool returned path outside the project root: ${filePath}`);
  }
  return relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function executeCommand({ command, args, cwd, input, environment = {} }) {
  const result = spawnSync(command, args, {
    cwd,
    input,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
  };
}

function normalizeResult(result) {
  return {
    status: result.status ?? null,
    signal: result.signal ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: normalizeError(result.error),
  };
}

function normalizeError(error) {
  if (error === undefined) {
    return undefined;
  }
  return error instanceof Error ? error.message : String(error);
}

function commandError(operation, result, filePath) {
  const detail =
    result.error ??
    (result.stderr.trim() || result.stdout.trim() || `exit status ${String(result.status)}`);
  return {
    tool: operation,
    path: filePath,
    message: detail,
  };
}

function renderLogEntry({ invocation, result }, index) {
  return [
    `=== invocation ${String(index + 1)} ===`,
    `cwd: ${invocation.cwd}`,
    `command: ${[invocation.command, ...invocation.args].map(shellQuote).join(' ')}`,
    `status: ${String(result.status)}`,
    `signal: ${String(result.signal)}`,
    result.error === undefined ? 'error:' : `error: ${result.error}`,
    'stdout:',
    result.stdout,
    'stderr:',
    result.stderr,
    '',
  ].join('\n');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
