import path from 'node:path';
import { prepareSnapshotDependencies, removeSnapshotDependencies } from './dependencies.mjs';
import { readLayout, typecheckEngine } from '../../preset/head-policy.mjs';
import { projectFile, hash, policyFile } from './shared.mjs';
import { linkPolicyFile } from '../../../../core/tooling/policy-links.mjs';
import { layoutTransformFor } from '../../preset/tool-configs.mjs';
import { diagnosticMessages } from '../typecheck/compiler-hints.mjs';
import {
  enclosingSymbol,
  loadTypeScript,
  preEmitDiagnostics,
} from '../typecheck/typescript-program.mjs';
import { withAssetImportHint } from '../typecheck/asset-import-hint.mjs';

export async function runTypecheck(options) {
  const ts = loadTypeScript(options.liveProjectRoot);
  const preparedDependencies = prepareSnapshotDependencies(options);
  let installedConfig;
  try {
    installedConfig = installTypeScriptConfig(options);
    const diagnostics = await preEmitDiagnostics({
      ts,
      engine: typecheckEngine(),
      configPath: installedConfig.targetPath,
      projectRoot: options.projectRoot,
    });
    const layout = readLayout();
    return normalizeTypeScriptDiagnostics({
      ts,
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
