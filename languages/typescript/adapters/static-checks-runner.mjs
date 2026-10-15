import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  globSync,
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PACKAGE_ROOT,
  resolveTool,
  SNAPSHOT_DIRECTORY_NAMES,
  toolNameForPath,
} from '../../../core/tooling/tool-resolution.mjs';
import { linkPolicyFile } from '../../../core/tooling/policy-links.mjs';
import { trackTemporaryPath } from '../../../core/tooling/temporary-files.mjs';
import { resolveDependencyHook } from './dependency-hooks.mjs';
import { existingRoots } from '../preset/layout.mjs';
import {
  prettierPrecedence,
  readHeadPolicy,
  readLayout,
  usesProjectConfig,
} from '../preset/head-policy.mjs';
import { isIgnoredByLayers, layeredPrettierOptions } from './prettier-layers.mjs';
import { layoutTransformFor } from '../preset/tool-configs.mjs';
import { formattingHunks } from './format-hunks.mjs';
import { loadDependencyGraph } from './dependency-graph/project-dependency-graph.mjs';
import {
  enclosingSymbol,
  formatDiagnostic,
  loadTypeScript,
  preEmitDiagnostics,
  withoutProjectRoot,
} from './typecheck/typescript-program.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const TRUSTED_TOOL_ROOT = PACKAGE_ROOT;
const SUPPORTED_KINDS = new Set(['prettier', 'typecheck', 'architecture']);
const VALUE_ARGUMENTS = new Set([
  '--analyzer-name',
  '--kind',
  '--project-root',
  '--policy-root',
  '--tool-root',
  '--live-project-root',
  '--config',
  '--ignore-path',
  '--include-only',
  '--exclude',
]);

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const findings = await runStaticCheck(options);
    process.stdout.write(`${JSON.stringify({ findings })}\n`);
  } catch (error) {
    process.stderr.write(
      `Static quality adapter failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}

async function runStaticCheck(options) {
  switch (options.kind) {
    case 'prettier':
      return runPrettier(options);
    case 'typecheck':
      return runTypecheck(options);
    case 'architecture':
      return runArchitecture(options);
    default:
      throw new Error(`Unsupported static check: ${options.kind}`);
  }
}

async function runPrettier(options) {
  if (options.patterns.length === 0) {
    throw new Error('Prettier requires at least one --pattern');
  }
  if (options.ignoreRelativePath === undefined) {
    throw new Error('Prettier requires --ignore-path');
  }
  if (
    !options.patterns.some((pattern) => globSync(pattern, { cwd: options.projectRoot }).length > 0)
  )
    return [];
  const installedPolicy = installPrettierPolicy(options);
  try {
    const precedence = prettierPrecedence();
    if (usesProjectConfig(precedence)) {
      return await layeredFormattingFindings(options, installedPolicy, precedence);
    }
    const unformattedFiles = listUnformattedFiles(options, installedPolicy);
    return await formattingFindingsOf(options, unformattedFiles, installedPolicy.configPath);
  } finally {
    installedPolicy.remove();
  }
}

function listUnformattedFiles(options, installedPolicy) {
  const result = runNodeTool({
    options,
    relativeToolPath: 'prettier/bin/prettier.cjs',
    arguments_: [
      '--config',
      installedPolicy.configPath,
      '--ignore-path',
      installedPolicy.ignorePath,
      '--list-different',
      '--no-error-on-unmatched-pattern',
      ...options.patterns,
      ...readLayout().exclude.map((glob) => `!${glob}`),
    ],
    acceptedStatuses: [0, 1],
  });
  const unformattedFiles = result.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (result.status === 1 && unformattedFiles.length === 0) {
    throw new Error(`Prettier reported formatting differences without file paths`);
  }
  return unformattedFiles;
}

async function layeredFormattingFindings(options, installedPolicy, precedence) {
  const prettier = await importPrettier();
  const policyOptions = readPrettierPolicy(installedPolicy.configPath);
  const layout = readLayout();
  const candidates = [
    ...new Set(
      options.patterns.flatMap((pattern) => globSync(pattern, { cwd: options.projectRoot })),
    ),
  ].filter((relativePath) => !layout.isExcluded(relativePath));
  const layers = {
    precedence,
    policyIgnorePath: installedPolicy.ignorePath,
    projectRoot: options.projectRoot,
    liveProjectRoot: options.liveProjectRoot,
  };
  const perFile = await Promise.all(
    candidates.map(async (relativePath) => {
      if (await isIgnoredByLayers(prettier, { ...layers, relativePath })) {
        return [];
      }
      const source = readFileSync(path.join(options.projectRoot, relativePath), 'utf8');
      const formatted = await prettier.format(source, {
        ...(await layeredPrettierOptions(prettier, { ...layers, policyOptions, relativePath })),
        filepath: path.join(options.projectRoot, relativePath),
      });
      return formatted === source
        ? []
        : formattingFindings({ tool: options.analyzerName, relativePath, source }, formatted);
    }),
  );
  return perFile.flat();
}

async function importPrettier() {
  return import(pathToFileURL(path.join(resolveTool('prettier').root, 'index.mjs')).href);
}

function readPrettierPolicy(configPath) {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error('Prettier policy is not valid JSON', { cause: error });
  }
}

async function formattingFindingsOf(options, unformattedFiles, configPath) {
  const prettier = await importPrettier();
  const prettierOptions = readPrettierPolicy(configPath);
  const perFile = await Promise.all(
    unformattedFiles.map(async (filePath) => {
      const relativePath = projectFile(options.projectRoot, filePath);
      const absolutePath = path.join(options.projectRoot, relativePath);
      const source = readFileSync(absolutePath, 'utf8');
      const formatted = await prettier.format(source, {
        ...prettierOptions,
        filepath: absolutePath,
      });
      return formattingFindings({ tool: options.analyzerName, relativePath, source }, formatted);
    }),
  );
  return perFile.flat();
}

async function runTypecheck(options) {
  loadTypeScript(options.liveProjectRoot);
  const preparedDependencies = prepareSnapshotDependencies(options);
  let installedConfig;
  try {
    installedConfig = installTypeScriptConfig(options);
    const diagnostics = await preEmitDiagnostics({
      engine: readHeadPolicy().tools.typescript?.engine ?? 'native',
      configPath: installedConfig.targetPath,
      projectRoot: options.projectRoot,
    });
    const layout = readLayout();
    return normalizeTypeScriptDiagnostics({
      diagnostics: diagnostics.filter(
        (diagnostic) =>
          diagnostic.file === undefined ||
          !layout.isExcluded(projectFile(options.projectRoot, diagnostic.file.fileName)),
      ),
      projectRoot: options.projectRoot,
      analyzerName: options.analyzerName,
      configRelativePath: options.configRelativePath,
    });
  } finally {
    try {
      installedConfig?.remove();
    } finally {
      removeSnapshotDependencies(preparedDependencies);
    }
  }
}

function runArchitecture(options) {
  if (options.patterns.length === 0) {
    throw new Error('Architecture requires at least one --pattern');
  }
  const layout = readLayout();
  if (layout.projectCodeFiles(options.projectRoot).length === 0) return [];
  const patterns = existingRoots(options.projectRoot, options.patterns);
  if (patterns.length === 0) return [];
  const report = loadDependencyGraph({
    projectRoot: options.projectRoot,
    policyRoot: options.policyRoot,
    liveProjectRoot: options.liveProjectRoot,
    patterns,
    exclude: options.exclude,
    includeOnly: options.includeOnly,
    configRelativePath: options.configRelativePath,
  });
  return normalizeArchitectureViolations(report, options.analyzerName);
}

export function normalizeTypeScriptDiagnostics({
  diagnostics,
  projectRoot,
  analyzerName,
  configRelativePath,
}) {
  loadTypeScript();
  const occurrences = new Map();
  return diagnostics.map((diagnostic) => {
    const message = withoutProjectRoot(formatDiagnostic(diagnostic), projectRoot);
    const relativePath =
      diagnostic.file === undefined
        ? configRelativePath
        : projectFile(projectRoot, diagnostic.file.fileName);
    const symbol =
      diagnostic.file === undefined || diagnostic.start === undefined
        ? undefined
        : enclosingSymbol(diagnostic.file, diagnostic.start);
    const semanticKey = JSON.stringify([diagnostic.code, relativePath, symbol ?? '', message]);
    const occurrence = (occurrences.get(semanticKey) ?? 0) + 1;
    occurrences.set(semanticKey, occurrence);
    const finding = {
      tool: analyzerName,
      rule: `TS${String(diagnostic.code)}`,
      path: relativePath,
      identity: [
        `diagnostic:${String(diagnostic.code)}`,
        `message:${hash(message)}`,
        `symbol:${symbol ?? ''}`,
        `occurrence:${String(occurrence)}`,
      ].join('|'),
      message,
      classification: 'enforceable',
    };
    if (symbol !== undefined) {
      finding.symbol = symbol;
    }
    if (diagnostic.file !== undefined && diagnostic.start !== undefined) {
      const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      finding.location = {
        line: location.line + 1,
        column: location.character + 1,
      };
    }
    return finding;
  });
}

export function normalizeArchitectureViolations(report, analyzerName) {
  if (!Array.isArray(report?.summary?.violations)) {
    throw new TypeError('dependency-cruiser report is missing summary.violations');
  }
  const occurrences = new Map();
  return report.summary.violations.map((violation, index) => {
    const context = `dependency-cruiser violation ${String(index)}`;
    const rule = requiredString(violation?.rule?.name, `${context}.rule.name`);
    const severity = requiredString(violation?.rule?.severity, `${context}.rule.severity`);
    const from = normalizedRelativePath(requiredString(violation.from, `${context}.from`), context);
    const to = normalizedRelativePath(requiredString(violation.to, `${context}.to`), context);
    const cycle = violation.type === 'cycle' ? canonicalCycle(violation.cycle, context) : undefined;
    const semanticIdentity = cycle === undefined ? `target:${to}` : `cycle:${cycle.join('>')}`;
    const canonicalPath = cycle?.[0] ?? from;
    const occurrenceKey = JSON.stringify([rule, canonicalPath, semanticIdentity]);
    const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1;
    occurrences.set(occurrenceKey, occurrence);
    return {
      tool: analyzerName,
      rule,
      path: canonicalPath,
      identity: `${semanticIdentity}|occurrence:${String(occurrence)}`,
      message:
        cycle === undefined
          ? `${from} must not depend on ${to}`
          : `Dependency cycle: ${cycle.join(' -> ')} -> ${cycle[0]}`,
      classification: severity === 'error' ? 'enforceable' : 'descriptive',
    };
  });
}

function canonicalCycle(value, context) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError(`${context}.cycle must contain at least two modules`);
  }
  const names = value.map((item, index) =>
    normalizedRelativePath(
      requiredString(item?.name, `${context}.cycle[${String(index)}].name`),
      context,
    ),
  );
  const rotations = names.map((_, index) => [...names.slice(index), ...names.slice(0, index)]);
  return rotations.sort((left, right) => left.join('\0').localeCompare(right.join('\0')))[0];
}

function installTypeScriptConfig(options) {
  return linkPolicyFile(
    policyFile(options, options.configRelativePath),
    path.join(options.projectRoot, '.nitpicker-diff-typecheck.json'),
    layoutTransformFor(options.configRelativePath, readLayout()),
  );
}

function installPrettierPolicy(options) {
  const policyConfig = policyFile(options, options.configRelativePath);
  const policyIgnore = policyFile(options, options.ignoreRelativePath);
  if (options.projectRoot === options.policyRoot) {
    return { configPath: policyConfig, ignorePath: policyIgnore, remove() {} };
  }
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-prettier.json');
  const ignorePath = path.join(options.projectRoot, '.nitpicker-diff-prettierignore');
  if (existsSync(configPath) || existsSync(ignorePath)) {
    throw new Error('Temporary Prettier policy path already exists');
  }
  trackTemporaryPath(configPath);
  trackTemporaryPath(ignorePath);
  symlinkSync(policyConfig, configPath, 'file');
  try {
    symlinkSync(policyIgnore, ignorePath, 'file');
  } catch (error) {
    unlinkSync(configPath);
    throw error;
  }
  return {
    configPath,
    ignorePath,
    remove() {
      unlinkSync(ignorePath);
      unlinkSync(configPath);
    },
  };
}

function runNodeTool({ options, relativeToolPath, arguments_, acceptedStatuses }) {
  const name = toolNameForPath(relativeToolPath);
  const toolPath = resolveTool(name, {
    projectRoot: options.liveProjectRoot,
    bin: relativeToolPath.slice(name.length + 1),
  }).binPath;
  const result = spawnSync(process.execPath, [toolPath, ...arguments_], {
    cwd: options.projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${options.kind} exited with ${String(result.status)}: ${detail}`);
  }
  return result;
}

export function dependencyPreparationMode({
  projectRoot,
  liveProjectRoot = PACKAGE_ROOT,
  dependencyHook = resolveDependencyHook(),
}) {
  if (projectRoot === liveProjectRoot) {
    return 'existing';
  }
  if (!existsSync(path.join(projectRoot, dependencyHook.manifests[0]))) {
    return 'link';
  }
  return dependencyManifestsDiffer(projectRoot, liveProjectRoot, dependencyHook)
    ? 'install'
    : 'link';
}

function dependencyManifestsDiffer(projectRoot, liveProjectRoot, dependencyHook) {
  return dependencyHook.manifests.some((relativePath) => {
    const projectPath = path.join(projectRoot, relativePath);
    const policyPath = path.join(liveProjectRoot, relativePath);
    const projectManifestExists = existsSync(projectPath);
    const policyManifestExists = existsSync(policyPath);
    if (!projectManifestExists || !policyManifestExists) {
      return projectManifestExists !== policyManifestExists;
    }
    return readFileSync(projectPath, 'utf8') !== readFileSync(policyPath, 'utf8');
  });
}

export function prepareSnapshotDependencies(options) {
  const dependencyHook = options.dependencyHook ?? resolveDependencyHook();
  const mode = dependencyPreparationMode({ ...options, dependencyHook });
  if (mode === 'existing') {
    return undefined;
  }
  const dependencyPath = path.join(options.projectRoot, dependencyHook.directory);
  if (existsSync(dependencyPath)) {
    validatePreparedDependencies(
      mode,
      dependencyPath,
      options.liveProjectRoot ?? PACKAGE_ROOT,
      dependencyHook,
    );
    return undefined;
  }
  switch (mode) {
    case 'install':
      return dependencyHook.install(options.projectRoot);
    case 'link':
      return linkDependencies(options, dependencyHook);
    default:
      throw new Error('Unsupported dependency preparation mode');
  }
}

function validatePreparedDependencies(mode, dependencyPath, liveProjectRoot, dependencyHook) {
  const entry = lstatSync(dependencyPath);
  if (mode === 'install' && entry.isDirectory() && !entry.isSymbolicLink()) {
    return;
  }
  const dependencyRoot = realpathSync(path.join(liveProjectRoot, dependencyHook.directory));
  if (
    mode === 'link' &&
    entry.isSymbolicLink() &&
    realpathSync(dependencyPath) === dependencyRoot
  ) {
    return;
  }
  throw new Error(`Existing dependencies at ${dependencyPath} do not match the snapshot manifests`);
}

function linkDependencies(options, dependencyHook) {
  if (options.projectRoot === (options.liveProjectRoot ?? PACKAGE_ROOT)) {
    return undefined;
  }
  const dependencyRoot = realpathSync(
    path.join(options.liveProjectRoot ?? PACKAGE_ROOT, dependencyHook.directory),
  );
  const linkPath = path.join(options.projectRoot, dependencyHook.directory);
  if (existsSync(linkPath)) {
    const entry = lstatSync(linkPath);
    if (entry.isSymbolicLink() && realpathSync(linkPath) === dependencyRoot) {
      return undefined;
    }
    throw new Error(`Refusing to replace existing dependencies at ${linkPath}`);
  }
  symlinkSync(dependencyRoot, linkPath, 'dir');
  return { kind: 'linked', dependencyPath: linkPath, dependencyRoot };
}

export function removeSnapshotDependencies(dependencies) {
  if (dependencies === undefined) {
    return;
  }
  const entry = lstatSync(dependencies.dependencyPath);
  if (dependencies.kind === 'installed') {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(
        `Refusing to remove replaced dependency directory: ${dependencies.dependencyPath}`,
      );
    }
    rmSync(dependencies.dependencyPath, { recursive: true });
    return;
  }
  if (
    !entry.isSymbolicLink() ||
    realpathSync(dependencies.dependencyPath) !== dependencies.dependencyRoot
  ) {
    throw new Error(`Refusing to remove replaced dependency link: ${dependencies.dependencyPath}`);
  }
  unlinkSync(dependencies.dependencyPath);
}

function projectFile(projectRoot, filePath) {
  const resolvedPath = realpathSync(path.resolve(projectRoot, filePath));
  const relativePath = path.relative(projectRoot, resolvedPath);
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Analyzer path must stay within ${projectRoot}: ${filePath} resolved to ${resolvedPath}`,
    );
  }
  const entry = lstatSync(resolvedPath);
  if (!entry.isFile()) {
    throw new Error(`Analyzer returned a non-file path: ${filePath}`);
  }
  return relativePath.replaceAll('\\', '/');
}

function policyFile(options, relativePath) {
  const normalizedPath = normalizedRelativePath(relativePath, relativePath);
  const filePath = path.resolve(options.policyRoot, normalizedPath);
  const relativeToPolicy = path.relative(options.policyRoot, filePath);
  if (relativeToPolicy.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToPolicy)) {
    throw new Error(`Policy path must stay within the policy root: ${relativePath}`);
  }
  if (!statSync(filePath).isFile()) {
    throw new Error(`Policy path is not a regular file: ${relativePath}`);
  }
  return filePath;
}

function recordValue(values, name, value) {
  if (!VALUE_ARGUMENTS.has(name)) {
    throw new Error(`Unknown static-check adapter argument: ${name}`);
  }
  values.set(name, value);
}

function collectArguments(arguments_) {
  const values = new Map();
  const patterns = [];
  const remaining = arguments_.values();
  for (const name of remaining) {
    const { value } = remaining.next();
    if (value === undefined) {
      throw new Error(`${name} requires a value`);
    }
    if (name === '--pattern') {
      patterns.push(value);
    } else {
      recordValue(values, name, value);
    }
  }
  return { values, patterns };
}

function parseArguments(arguments_) {
  const { values, patterns } = collectArguments(arguments_);
  const kind = requiredValue(values, '--kind');
  if (!SUPPORTED_KINDS.has(kind)) {
    throw new Error(`Unsupported static check: ${kind}`);
  }
  const toolRoot = realpathSync(requiredValue(values, '--tool-root'));
  if (toolRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error('--tool-root must be the project checkout containing this adapter');
  }
  return {
    analyzerName: requiredValue(values, '--analyzer-name'),
    kind,
    projectRoot: validatedSnapshotRoot(requiredValue(values, '--project-root'), '--project-root'),
    policyRoot: validatedSnapshotRoot(requiredValue(values, '--policy-root'), '--policy-root'),
    toolRoot,
    liveProjectRoot:
      values.get('--live-project-root') === undefined
        ? PACKAGE_ROOT
        : directoryRoot(values.get('--live-project-root'), '--live-project-root'),
    configRelativePath: normalizedRelativePath(requiredValue(values, '--config'), '--config'),
    ignoreRelativePath:
      values.get('--ignore-path') === undefined
        ? undefined
        : normalizedRelativePath(values.get('--ignore-path'), '--ignore-path'),
    includeOnly: values.get('--include-only'),
    exclude: values.get('--exclude'),
    patterns: patterns.map((value) => normalizedPattern(value)),
  };
}

function directoryRoot(value, name) {
  const root = realpathSync(path.resolve(value));
  if (!statSync(root).isDirectory()) {
    throw new Error(`${name} must be a directory`);
  }
  return root;
}

function validatedSnapshotRoot(value, name) {
  const root = directoryRoot(value, name);
  if (root === TRUSTED_TOOL_ROOT) {
    return root;
  }
  const relativeToTemporaryRoot = path.relative(realpathSync(tmpdir()), root);
  const segments = relativeToTemporaryRoot.split(path.sep);
  if (
    relativeToTemporaryRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToTemporaryRoot) ||
    segments.length < 2 ||
    !segments[0].startsWith('nitpicker-diff-') ||
    !SNAPSHOT_DIRECTORY_NAMES.includes(segments[1])
  ) {
    throw new Error(`${name} must be inside a generated quality-diff worktree`);
  }
  return root;
}

function normalizedPattern(value) {
  if (
    value.length === 0 ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:\//.test(value) ||
    value.split('/').includes('..')
  ) {
    throw new Error('--pattern must stay within the analyzed snapshot');
  }
  return value.replaceAll('\\', '/');
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
    throw new Error(`${context} must stay within the analyzed snapshot`);
  }
  return normalizedPath;
}

function formattingFindings({ tool, relativePath, source }, formatted) {
  const seen = new Map();
  return formattingHunks(source, formatted).map((hunk) => {
    const digest = hash(`${hunk.original}\0${hunk.formatted}`);
    const occurrence = seen.get(digest) ?? 0;
    seen.set(digest, occurrence + 1);
    return {
      tool,
      rule: 'prettier/prettier',
      path: relativePath,
      identity: `format-diff:${digest}${occurrence === 0 ? '' : `#${String(occurrence)}`}`,
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: hunk.line, endLine: hunk.line + Math.max(hunk.count, 1) - 1 },
    };
  });
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function requiredValue(values, name) {
  return requiredString(values.get(name), name);
}

function requiredString(value, context) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${context} must be a non-empty string`);
  }
  return value;
}
