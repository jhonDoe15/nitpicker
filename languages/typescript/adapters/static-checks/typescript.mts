import { existsSync, readFileSync, realpathSync } from 'node:fs';
import type TypeScript from 'typescript';
import path from 'node:path';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../typed/static-checks.mts';
import { layoutTransformFor, readLayout, typecheckEngine } from '../typed/head-policy.mts';
import type { StaticCheckOptions } from './arguments.mts';
import { type Finding, projectFile, hash, policyFile } from './shared.mts';
import { type LinkedPolicyFile, linkPolicyFile } from '../typed/tooling.mts';
import { diagnosticMessages } from '../typecheck/compiler-hints.mts';
import {
  enclosingSymbol,
  preEmitDiagnostics,
  projectTypeScript,
} from '../typecheck/typescript-program.mts';
import { withAssetImportHint } from '../typecheck/asset-import-hint.mts';

type TypeScriptDiagnostics = {
  readonly diagnostics: readonly TypeScript.Diagnostic[];
  readonly projectRoot: string;
  readonly analyzerName: string;
  readonly configRelativePath: string;
  readonly ts: typeof TypeScript;
};

type DiagnosticFilter = {
  readonly layout: ReturnType<typeof readLayout>;
  readonly contextOnly: ReadonlySet<string>;
  readonly projectRoot: string;
};

function isReportedDiagnostic(
  diagnostic: TypeScript.Diagnostic,
  filter: DiagnosticFilter,
): boolean {
  if (diagnostic.file === undefined) {
    return true;
  }
  const file = projectFile(filter.projectRoot, diagnostic.file.fileName);
  return !(filter.layout.isExcluded(file) || filter.contextOnly.has(file));
}

export async function runTypecheck(options: StaticCheckOptions): Promise<Finding[]> {
  const { ts, native } = projectTypeScript(options.liveProjectRoot);
  const preparedDependencies = prepareSnapshotDependencies(options);
  let installedConfig: LinkedPolicyFile | undefined;
  try {
    installedConfig = installTypeScriptConfig(options);
    const { targetPath } = installedConfig;
    const configRelativePath =
      extendedProjectConfig(targetPath, options.projectRoot) ?? options.configRelativePath;
    const diagnostics = await preEmitDiagnostics({
      ts,
      engine: typecheckEngine(),
      configPath: targetPath,
      configName: configRelativePath,
      projectRoot: options.projectRoot,
      projectNative: native,
    });
    const layout = readLayout();
    const contextOnly = contextOnlyFiles(targetPath, options.projectRoot, layout);
    return normalizeTypeScriptDiagnostics({
      ts,
      diagnostics: diagnostics
        .map((diagnostic) => withProjectConfigFile(diagnostic, targetPath, options))
        .filter((diagnostic) =>
          isReportedDiagnostic(diagnostic, {
            layout,
            contextOnly,
            projectRoot: options.projectRoot,
          }),
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

export function contextOnlyFiles(
  configPath: string,
  projectRoot: string,
  layout: ReturnType<typeof readLayout>,
): ReadonlySet<string> {
  const config: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
  const files: unknown =
    typeof config === 'object' && config !== null && 'files' in config ? config.files : [];
  const listed = Array.isArray(files)
    ? files.filter((file): file is string => typeof file === 'string')
    : [];
  return new Set(
    listed
      .map((file) => projectFile(projectRoot, path.resolve(path.dirname(configPath), file)))
      .filter((file) => !(layout.isSourceFile(file) || layout.isTestFile(file))),
  );
}

function installTypeScriptConfig(options: StaticCheckOptions): LinkedPolicyFile {
  return linkPolicyFile(
    policyFile(options, options.configRelativePath),
    path.join(options.projectRoot, '.nitpicker-diff-typecheck.json'),
    layoutTransformFor(options.configRelativePath, readLayout(), { projectRootFiles: true }),
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
