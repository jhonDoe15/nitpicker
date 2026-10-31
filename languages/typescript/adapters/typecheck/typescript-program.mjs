import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  isToolInstalled,
  PACKAGE_ROOT,
  resolveTool,
} from '../../../../core/tooling/tool-resolution.mjs';
import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
import { packageHasJavaScriptApi } from '../../typescript-api/api-redirect.mjs';
import { ts as selectedTypeScript } from '../../typescript-api/typescript-api.mjs';
import { configFailure, isNonFatalConfigCode, nativeDiagnostics } from './native-diagnostics.mjs';

const NO_INPUTS_CODE = 18003;

export function projectTypeScript(projectRoot = PACKAGE_ROOT) {
  if (!isToolInstalled('typescript', { projectRoot })) {
    return { ts: selectedTypeScript };
  }
  const { root } = resolveTool('typescript', { projectRoot });
  return packageHasJavaScriptApi(root)
    ? { ts: createRequire(import.meta.url)(path.join(root, 'lib/typescript.js')) }
    : { ts: selectedTypeScript, native: root };
}

export function loadTypeScript(projectRoot = PACKAGE_ROOT) {
  return projectTypeScript(projectRoot).ts;
}

export async function preEmitDiagnostics(options) {
  try {
    return await engineDiagnostics(options);
  } catch (error) {
    if (options.configName === undefined || error.configError !== true) {
      throw error;
    }
    const detail = withoutProjectRoot(error.message, options.projectRoot);
    throw new Error(`TypeScript config ${options.configName} is invalid: ${detail}`, {
      cause: error,
    });
  }
}

async function engineDiagnostics({ ts, engine, configPath, projectRoot, projectNative }) {
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
    const own = await nativeDiagnostics({ ts, configPath, projectRoot, apiRoot: projectNative });
    return own.diagnostics;
  }
  return projectDiagnostics(ts, configPath, projectRoot);
}

function projectDiagnostics(ts, configPath, projectRoot) {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
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
    projectReferences: parsedConfig.projectReferences,
    configFileParsingDiagnostics: parsedConfig.errors,
  });
  return ts.getPreEmitDiagnostics(program);
}

export function formatDiagnostic(ts, diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n').trim();
}

export function withoutProjectRoot(message, projectRoot) {
  const roots = [...new Set([projectRoot, realpathSync(projectRoot)])]
    .map((root) => escapeRegExp(root.replaceAll('\\', '/')))
    .sort((left, right) => right.length - left.length);
  const pattern = new RegExp(`(?<![\\w.\\-/])(?:${roots.join('|')})(?:/|(?![\\w-]|\\.\\w))`, 'gu');
  return message.replaceAll(pattern, (match) => (match.endsWith('/') ? '' : '.'));
}

function nodeChain(node) {
  const chain = [node];
  for (const current of chain) {
    if (current.parent !== undefined) chain.push(current.parent);
  }
  return chain;
}

function deepestNodeAt(ts, sourceFile, position) {
  const pending = [sourceFile];
  for (const candidate of pending) {
    ts.forEachChild(candidate, (child) => {
      if (child.pos <= position && position < child.end) pending.push(child);
    });
  }
  return pending.at(-1);
}

export function enclosingSymbol(ts, sourceFile, position) {
  const names = nodeChain(deepestNodeAt(ts, sourceFile, position))
    .filter(
      (current) =>
        (ts.isFunctionDeclaration(current) ||
          ts.isClassDeclaration(current) ||
          ts.isMethodDeclaration(current) ||
          ts.isPropertyDeclaration(current) ||
          ts.isVariableDeclaration(current)) &&
        current.name !== undefined,
    )
    .map((current) => current.name.getText());
  return names.length === 0 ? undefined : names.reverse().join('.');
}
