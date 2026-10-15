import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PACKAGE_ROOT, resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { escapeRegExp } from '../../../../shared/glob.mjs';
import { nativeDiagnostics } from './native-diagnostics.mjs';

const NO_INPUTS_CODE = 18003;
export function loadTypeScript(projectRoot = PACKAGE_ROOT) {
  const root = resolveTool('typescript', { projectRoot }).root;
  const libraryPath = path.join(root, 'lib/typescript.js');
  if (!existsSync(libraryPath)) {
    throw new Error(
      `The type check reads source files with the project's typescript package, which must be 5.7 to 6.x: ` +
        `${root} has no JavaScript API, which TypeScript 7 does not ship yet.`,
    );
  }
  return createRequire(import.meta.url)(libraryPath);
}

export async function preEmitDiagnostics({ ts, engine, configPath, projectRoot }) {
  if (engine === 'native') {
    const native = await nativeDiagnostics({ ts, configPath, projectRoot });
    if (native.unsupported !== true) return native.diagnostics;
  }
  return projectDiagnostics(ts, configPath, projectRoot);
}

function projectDiagnostics(ts, configPath, projectRoot) {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error !== undefined) {
    throw new Error(formatDiagnostic(ts, configFile.error));
  }
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    projectRoot,
    undefined,
    configPath,
  );
  if (
    parsedConfig.fileNames.length === 0 &&
    parsedConfig.errors.every((error) => error.code === NO_INPUTS_CODE)
  )
    return [];
  if (parsedConfig.errors.length > 0) {
    throw new Error(parsedConfig.errors.map((error) => formatDiagnostic(ts, error)).join('\n'));
  }
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
    projectReferences: parsedConfig.projectReferences,
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
