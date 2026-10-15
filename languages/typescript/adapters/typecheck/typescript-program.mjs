import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PACKAGE_ROOT, resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { escapeRegExp } from '../../../../shared/glob.mjs';
import { nativeDiagnostics } from './native-diagnostics.mjs';

const NO_INPUTS_CODE = 18003;
let ts;

export function loadTypeScript(projectRoot = PACKAGE_ROOT) {
  if (ts === undefined) {
    const root = resolveTool('typescript', { projectRoot }).root;
    ts = createRequire(import.meta.url)(path.join(root, 'lib/typescript.js'));
  }
  return ts;
}

export async function preEmitDiagnostics({ engine, configPath, projectRoot }) {
  if (engine === 'native') {
    const native = await nativeDiagnostics({ ts, configPath, projectRoot });
    if (native.unsupportedConfig !== true) return native.diagnostics;
  }
  return projectDiagnostics(configPath, projectRoot);
}

function projectDiagnostics(configPath, projectRoot) {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error !== undefined) {
    throw new Error(formatDiagnostic(configFile.error));
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
    throw new Error(parsedConfig.errors.map(formatDiagnostic).join('\n'));
  }
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
    projectReferences: parsedConfig.projectReferences,
  });
  return ts.getPreEmitDiagnostics(program);
}

export function formatDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n').trim();
}

export function withoutProjectRoot(message, projectRoot) {
  const roots = [...new Set([projectRoot, realpathSync(projectRoot)])]
    .map((root) => root.replaceAll('\\', '/'))
    .sort((left, right) => right.length - left.length);
  return roots.reduce(
    (text, root) =>
      text
        .replaceAll(`${root}/`, '')
        .replaceAll(new RegExp(`${escapeRegExp(root)}(?![\\w-]|\\.\\w)`, 'gu'), '.'),
    message,
  );
}

function nodeChain(node) {
  const chain = [node];
  for (const current of chain) {
    if (current.parent !== undefined) chain.push(current.parent);
  }
  return chain;
}

function deepestNodeAt(sourceFile, position) {
  const pending = [sourceFile];
  for (const candidate of pending) {
    ts.forEachChild(candidate, (child) => {
      if (child.pos <= position && position < child.end) pending.push(child);
    });
  }
  return pending.at(-1);
}

export function enclosingSymbol(sourceFile, position) {
  const names = nodeChain(deepestNodeAt(sourceFile, position))
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
