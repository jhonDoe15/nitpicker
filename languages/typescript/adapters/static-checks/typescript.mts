import { existsSync, readFileSync, realpathSync } from 'node:fs';
import type TypeScript from 'typescript';
import path from 'node:path';
import { prepareSnapshotDependencies, removeSnapshotDependencies } from './dependencies.mjs';
import { readLayout, typecheckEngine } from '../../preset/head-policy.mjs';
import type { StaticCheckOptions } from './arguments.mts';
import { type Finding, projectFile, hash, policyFile } from './shared.mts';
import { linkPolicyFile } from '../../../../core/tooling/policy-links.mjs';
import { layoutTransformFor } from '../../preset/tool-configs.mjs';
import { diagnosticMessages } from '../typecheck/compiler-hints.mts';
import {
  enclosingSymbol,
  preEmitDiagnostics,
  projectTypeScript,
} from '../typecheck/typescript-program.mjs';
import { withAssetImportHint } from '../typecheck/asset-import-hint.mts';

type InstalledConfig = { readonly targetPath: string; remove(): void };

type TypeScriptDiagnostics = {
  readonly diagnostics: readonly TypeScript.Diagnostic[];
  readonly projectRoot: string;
  readonly analyzerName: string;
  readonly configRelativePath: string;
  readonly ts: typeof TypeScript;
};

export async function runTypecheck(options: StaticCheckOptions): Promise<Finding[]> {
  const { ts, native } = projectTypeScript(options.liveProjectRoot);
  const preparedDependencies = prepareSnapshotDependencies(options);
  let installedConfig: InstalledConfig | undefined;
  try {
    installedConfig = installTypeScriptConfig(options);
    const { targetPath } = installedConfig;
    const configRelativePath =
      extendedProjectConfig(targetPath, options.projectRoot) ?? options.configRelativePath;
    const diagnostics: TypeScript.Diagnostic[] = await preEmitDiagnostics({
      ts,
      engine: typecheckEngine(),
      configPath: targetPath,
      configName: configRelativePath,
      projectRoot: options.projectRoot,
      projectNative: native,
    });
    const layout = readLayout();
    return normalizeTypeScriptDiagnostics({
      ts,
      diagnostics: diagnostics
        .map((diagnostic) => withProjectConfigFile(diagnostic, targetPath, options))
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
}: TypeScriptDiagnostics): Finding[] {
  const occurrences = new Map<string, number>();
  return diagnostics.map((diagnostic) => {
    const { message, display } = diagnosticMessages(ts, diagnostic, projectRoot);
    const relativePath =
      diagnostic.file === undefined
        ? configRelativePath
        : projectFile(projectRoot, diagnostic.file.fileName);
    const symbol: string | undefined =
      diagnostic.file === undefined || diagnostic.start === undefined
        ? undefined
        : enclosingSymbol(ts, diagnostic.file, diagnostic.start);
    const semanticKey = JSON.stringify([diagnostic.code, relativePath, symbol ?? '', message]);
    const occurrence = (occurrences.get(semanticKey) ?? 0) + 1;
    occurrences.set(semanticKey, occurrence);
    const finding: Finding = {
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

function installTypeScriptConfig(options: StaticCheckOptions): InstalledConfig {
  return linkPolicyFile(
    policyFile(options, options.configRelativePath),
    path.join(options.projectRoot, '.nitpicker-diff-typecheck.json'),
    layoutTransformFor(options.configRelativePath, readLayout()),
  );
}

function extendedProjectConfig(configPath: string, projectRoot: string): string | undefined {
  const config: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
  const extended =
    typeof config === 'object' && config !== null && 'extends' in config
      ? config.extends
      : undefined;
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

function insideProject(projectRoot: string, filePath: string): boolean {
  const relative = path.relative(realpathSync(projectRoot), realpathSync(filePath));
  return (
    relative.length > 0 &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function withProjectConfigFile(
  diagnostic: TypeScript.Diagnostic,
  configPath: string,
  { projectRoot }: { readonly projectRoot: string },
): TypeScript.Diagnostic {
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
