import { PACKAGE_ROOT, resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { prepareSnapshotDependencies, removeSnapshotDependencies } from './dependencies.mjs';
import { readLayout } from '../../preset/head-policy.mjs';
import { projectFile, hash, policyFile } from './shared.mjs';
import { linkPolicyFile } from '../../../../core/tooling/policy-links.mjs';
import { layoutTransformFor } from '../../preset/tool-configs.mjs';
import { depthFirst, chainOf } from '../../../../shared/traversal.mjs';

function loadTypeScript(projectRoot = PACKAGE_ROOT) {
  const root = resolveTool('typescript', { projectRoot }).root;
  return createRequire(import.meta.url)(path.join(root, 'lib/typescript.js'));
}

export function runTypecheck(options) {
  const ts = loadTypeScript(options.liveProjectRoot);
  const preparedDependencies = prepareSnapshotDependencies(options);
  let installedConfig;
  try {
    installedConfig = installTypeScriptConfig(options);
    return typecheckConfig(options, ts, installedConfig.targetPath);
  } finally {
    try {
      installedConfig?.remove();
    } finally {
      removeSnapshotDependencies(preparedDependencies);
    }
  }
}

function typecheckConfig(options, ts, configPath) {
  const parsedConfig = parseTypeScriptConfig(options, ts, configPath);
  if (
    parsedConfig.fileNames.length === 0 &&
    parsedConfig.errors.every((error) => error.code === 18003)
  ) {
    return [];
  }
  if (parsedConfig.errors.length > 0) {
    throw new Error(parsedConfig.errors.map((error) => formatDiagnostic(error, ts)).join('\n'));
  }
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
    projectReferences: parsedConfig.projectReferences,
  });
  const layout = readLayout();
  return normalizeTypeScriptDiagnostics({
    typescript: ts,
    diagnostics: ts
      .getPreEmitDiagnostics(program)
      .filter(
        (diagnostic) =>
          diagnostic.file === undefined ||
          !layout.isExcluded(projectFile(options.projectRoot, diagnostic.file.fileName)),
      ),
    projectRoot: options.projectRoot,
    analyzerName: options.analyzerName,
    configRelativePath: options.configRelativePath,
  });
}

function parseTypeScriptConfig(options, ts, configPath) {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error !== undefined) {
    throw new Error(formatDiagnostic(configFile.error, ts));
  }
  return ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    options.projectRoot,
    undefined,
    configPath,
  );
}

function normalizeTypeScriptDiagnostics({
  diagnostics,
  projectRoot,
  analyzerName,
  configRelativePath,
  typescript: ts = loadTypeScript(),
}) {
  const occurrences = new Map();
  return diagnostics.map((diagnostic) => {
    const message = formatDiagnostic(diagnostic, ts);
    const relativePath =
      diagnostic.file === undefined
        ? configRelativePath
        : projectFile(projectRoot, diagnostic.file.fileName);
    const symbol =
      diagnostic.file === undefined || diagnostic.start === undefined
        ? undefined
        : enclosingSymbol(diagnostic.file, diagnostic.start, ts);
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

function installTypeScriptConfig(options) {
  return linkPolicyFile(
    policyFile(options, options.configRelativePath),
    path.join(options.projectRoot, '.nitpicker-diff-typecheck.json'),
    layoutTransformFor(options.configRelativePath, readLayout()),
  );
}

function syntaxChildren(node, ts) {
  const children = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

function enclosingSymbol(sourceFile, position, ts) {
  let node = sourceFile;
  function containing(candidate) {
    return candidate.pos <= position && position < candidate.end;
  }
  for (const candidate of depthFirst(sourceFile, (parent) =>
    syntaxChildren(parent, ts).filter(containing),
  )) {
    if (containing(candidate)) node = candidate;
  }
  const names = [];
  for (const current of chainOf(node, (current) => current.parent)) {
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isClassDeclaration(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isPropertyDeclaration(current) ||
        ts.isVariableDeclaration(current)) &&
      current.name !== undefined
    ) {
      names.push(current.name.getText());
    }
  }
  return names.length === 0 ? undefined : names.reverse().join('.');
}

function formatDiagnostic(diagnostic, ts) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n').trim();
}
