import type TypeScript from 'typescript';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { isToolInstalled, resolveTool } from '../typed/tooling.mts';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mjs';
import { packageHasJavaScriptApi } from '../../typescript-api/api-redirect.mjs';
import { chainOf, isTypeScriptApi, parentOf, typescriptApi } from '../typed/typescript-program.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { configFailure, isNonFatalConfigCode, nativeDiagnostics } from './native-diagnostics.mts';

type ProjectTypeScript = { readonly ts: typeof TypeScript; readonly native?: string };

type Diagnostics = readonly TypeScript.Diagnostic[];

export type PreEmitRequest = {
  readonly ts: typeof TypeScript;
  readonly engine: string;
  readonly configPath: string;
  readonly configName: string | undefined;
  readonly projectRoot: string;
  readonly projectNative: string | undefined;
};

const NO_INPUTS_CODE = 18003;

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;

export function projectTypeScript(projectRoot: string = PACKAGE_ROOT): ProjectTypeScript {
  if (!isToolInstalled('typescript', { projectRoot })) {
    return { ts: typescriptApi() };
  }
  const { root } = resolveTool('typescript', { projectRoot });
  return packageHasJavaScriptApi(root)
    ? {
        ts: requiredTypeScript(
          createRequire(import.meta.url)(path.join(root, 'lib/typescript.js')),
        ),
      }
    : { ts: typescriptApi(), native: root };
}

function requiredTypeScript(api: unknown): typeof TypeScript {
  if (!isTypeScriptApi(api)) {
    throw new TypeError('The project TypeScript API does not load');
  }
  return api;
}

export function loadTypeScript(projectRoot: string = PACKAGE_ROOT): typeof TypeScript {
  return projectTypeScript(projectRoot).ts;
}

export async function preEmitDiagnostics(options: PreEmitRequest): Promise<Diagnostics> {
  try {
    return await engineDiagnostics(options);
  } catch (error) {
    if (options.configName === undefined || fieldOf(error, 'configError') !== true) {
      throw error;
    }
    const detail = withoutProjectRoot(String(fieldOf(error, 'message')), options.projectRoot);
    throw new Error(`TypeScript config ${options.configName} is invalid: ${detail}`, {
      cause: error,
    });
  }
}

async function engineDiagnostics({
  ts,
  engine,
  configPath,
  projectRoot,
  projectNative,
}: PreEmitRequest): Promise<Diagnostics> {
  if (engine === 'native') {
    const native = await nativeDiagnostics({
      ts,
      configPath,
      projectRoot,
      engineHint: projectNative === undefined,
    });
    if (native.unsupported !== true) {
      return native.diagnostics;
    }
  }
  if (projectNative !== undefined) {
    const own = await nativeDiagnostics({
      ts,
      configPath,
      projectRoot,
      apiRoot: projectNative,
      engineHint: false,
    });
    return own.diagnostics ?? [];
  }
  return projectDiagnostics(ts, configPath, projectRoot);
}

function projectDiagnostics(
  ts: typeof TypeScript,
  configPath: string,
  projectRoot: string,
): Diagnostics {
  const configFile = ts.readConfigFile(configPath, (name) => ts.sys.readFile(name));
  if (configFile.error !== undefined) {
    throw configFailure(formatDiagnostic(ts, configFile.error));
  }
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    projectRoot,
    undefined,
    configPath,
  );
  const fatalErrors = parsedConfig.errors.filter(
    (error) => !isNonFatalConfigCode(error.code) && error.code !== NO_INPUTS_CODE,
  );
  if (fatalErrors.length > 0) {
    throw configFailure(fatalErrors.map((error) => formatDiagnostic(ts, error)).join('\n'));
  }
  if (parsedConfig.fileNames.length === 0) {
    return ts.sortAndDeduplicateDiagnostics(
      parsedConfig.errors.filter((error) => error.code !== NO_INPUTS_CODE),
    );
  }
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
    ...(parsedConfig.projectReferences === undefined
      ? {}
      : { projectReferences: parsedConfig.projectReferences }),
    configFileParsingDiagnostics: parsedConfig.errors,
  });
  return ts.getPreEmitDiagnostics(program);
}

export function formatDiagnostic(ts: typeof TypeScript, diagnostic: TypeScript.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n').trim();
}

export function withoutProjectRoot(message: string, projectRoot: string): string {
  const roots = [...new Set([projectRoot, realpathSync(projectRoot)])]
    .map((root) => escapeRegExp(root.replaceAll('\\', '/')))
    .sort((left, right) => right.length - left.length);
  const pattern = new RegExp(`(?<![\\w.\\-/])(?:${roots.join('|')})(?:/|(?![\\w-]|\\.\\w))`, 'gu');
  return message.replaceAll(pattern, (match) => (match.endsWith('/') ? '' : '.'));
}

function deepestNodeAt(
  ts: typeof TypeScript,
  sourceFile: TypeScript.SourceFile,
  position: number,
): TypeScript.Node {
  const pending: TypeScript.Node[] = [sourceFile];
  for (const candidate of pending) {
    ts.forEachChild(candidate, (child) => {
      if (child.pos <= position && position < child.end) {
        pending.push(child);
      }
    });
  }
  return pending.at(-1) ?? sourceFile;
}

function declaredName(ts: typeof TypeScript, current: TypeScript.Node): string | undefined {
  const named =
    ts.isFunctionDeclaration(current) ||
    ts.isClassDeclaration(current) ||
    ts.isMethodDeclaration(current) ||
    ts.isPropertyDeclaration(current) ||
    ts.isVariableDeclaration(current);
  return named ? current.name?.getText() : undefined;
}

export function enclosingSymbol(
  ts: typeof TypeScript,
  sourceFile: TypeScript.SourceFile,
  position: number,
): string | undefined {
  const names = chainOf(deepestNodeAt(ts, sourceFile, position), parentOf)
    .map((current) => declaredName(ts, current))
    .filter((name) => name !== undefined);
  return names.length === 0 ? undefined : names.reverse().join('.');
}
