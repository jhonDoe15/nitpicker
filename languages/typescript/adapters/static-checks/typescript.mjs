import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { prepareSnapshotDependencies, removeSnapshotDependencies } from './dependencies.mjs';
import { readLayout, typecheckEngine } from '../../preset/head-policy.mjs';
import { projectFile, hash, policyFile } from './shared.mjs';
import { linkPolicyFile } from '../../../../core/tooling/policy-links.mjs';
import { layoutTransformFor } from '../../preset/tool-configs.mjs';
import { diagnosticMessages } from '../typecheck/compiler-hints.mjs';
import {
  enclosingSymbol,
  preEmitDiagnostics,
  projectTypeScript,
} from '../typecheck/typescript-program.mjs';
import { withAssetImportHint } from '../typecheck/asset-import-hint.mjs';

export async function runTypecheck(options) {
  const { ts, native } = projectTypeScript(options.liveProjectRoot);
  const preparedDependencies = prepareSnapshotDependencies(options);
  let installedConfig;
  try {
    installedConfig = installTypeScriptConfig(options);
    const configRelativePath =
      extendedProjectConfig(installedConfig.targetPath, options.projectRoot) ??
      options.configRelativePath;
    const diagnostics = await preEmitDiagnostics({
      ts,
      engine: typecheckEngine(),
      configPath: installedConfig.targetPath,
      configName: configRelativePath,
      projectRoot: options.projectRoot,
      projectNative: native,
    });
    const layout = readLayout();
    return normalizeTypeScriptDiagnostics({
      ts,
      diagnostics: diagnostics
        .map((diagnostic) => withProjectConfigFile(diagnostic, installedConfig.targetPath, options))
        .filter(
          (diagnostic) =>
            diagnostic.file === undefined ||
            !layout.isExcluded(projectFile(options.projectRoot, diagnostic.file.fileName)),
        ),
      projectRoot: options.projectRoot,
      analyzerName: options.analyzerName,
      configRelativePath,
    });
  } finally {
    try {
      installedConfig?.remove();
    } finally {
      removeSnapshotDependencies(preparedDependencies);
    }
  }
}

export function normalizeTypeScriptDiagnostics({
  diagnostics,
  projectRoot,
  analyzerName,
  configRelativePath,
  ts,
}) {
  const occurrences = new Map();
  return diagnostics.map((diagnostic) => {
    const { message, display } = diagnosticMessages(ts, diagnostic, projectRoot);
    const relativePath =
      diagnostic.file === undefined
        ? configRelativePath
        : projectFile(projectRoot, diagnostic.file.fileName);
    const symbol =
      diagnostic.file === undefined || diagnostic.start === undefined
        ? undefined
        : enclosingSymbol(ts, diagnostic.file, diagnostic.start);
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
      message: withAssetImportHint(diagnostic.code, display),
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

function extendedProjectConfig(configPath, projectRoot) {
  const extended = JSON.parse(readFileSync(configPath, 'utf8')).extends;
  if (typeof extended !== 'string') {
    return undefined;
  }
  const configDirectory = path.dirname(configPath);
  const extendedPath = path.resolve(configDirectory, extended);
  if (!extendedPath.startsWith(configDirectory + path.sep)) {
    return undefined;
  }
  return existsSync(extendedPath) ? projectFile(projectRoot, extendedPath) : undefined;
}

function insideProject(projectRoot, filePath) {
  const relative = path.relative(realpathSync(projectRoot), realpathSync(filePath));
  return (
    relative.length > 0 &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function withProjectConfigFile(diagnostic, configPath, { projectRoot }) {
  const fileName = diagnostic.file?.fileName;
  if (
    fileName === undefined ||
    !fileName.endsWith('.json') ||
    (path.resolve(fileName) !== configPath && insideProject(projectRoot, fileName))
  ) {
    return diagnostic;
  }
  return { ...diagnostic, file: undefined, start: undefined, length: undefined };
}
