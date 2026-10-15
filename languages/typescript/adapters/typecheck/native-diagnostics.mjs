import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';

const NO_INPUTS_CODE = 18003;
const REMOVED_OPTION_CODES = new Set([5102, 5108]);
const ENGINE_HINT =
  'Set "tools": { "typescript": { "engine": "project" } } in nitpicker.config.json ' +
  "to type check with the project's own TypeScript instead.";

export async function nativeDiagnostics({ ts, configPath, projectRoot }) {
  const api = await startedApi(projectRoot);
  if (api === undefined) return { unsupported: true };
  let collected;
  try {
    collected = collectedDiagnostics(api, configPath);
  } catch (error) {
    throw new Error(`TypeScript 7 type check failed: ${String(error.message)}\n${ENGINE_HINT}`, {
      cause: error,
    });
  } finally {
    api.close();
  }
  return settledDiagnostics(ts, collected);
}

async function startedApi(projectRoot) {
  const apiPath = path.join(resolveTool('typescript-native').root, 'dist/api/sync/api.js');
  const { API } = await import(pathToFileURL(apiPath).href);
  try {
    return new API({ cwd: projectRoot });
  } catch {
    return undefined;
  }
}

function collectedDiagnostics(api, configPath) {
  const [project] = api.updateSnapshot({ openProjects: [configPath] }).getProjects();
  const { program, compilerOptions } = project;
  const emitsDeclarations =
    compilerOptions.declaration === true || compilerOptions.composite === true;
  return {
    hasRootFiles: project.rootFiles.length > 0,
    configErrors: program.getConfigFileParsingDiagnostics(),
    diagnostics: [
      ...program.getProgramDiagnostics().map(withoutConfigLocation),
      ...program.getSyntacticDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getBindDiagnostics(),
      ...program.getSemanticDiagnostics(),
      ...(emitsDeclarations ? program.getDeclarationDiagnostics() : []),
    ],
  };
}

function withoutConfigLocation(diagnostic) {
  return diagnostic.fileName?.endsWith('.json') === true
    ? { ...diagnostic, fileName: undefined, pos: -1, end: -1 }
    : diagnostic;
}

function settledDiagnostics(ts, { hasRootFiles, configErrors, diagnostics }) {
  if (!hasRootFiles && configErrors.every(({ code }) => code === NO_INPUTS_CODE)) {
    return { diagnostics: [] };
  }
  if (configErrors.length > 0 || diagnostics.some(({ code }) => REMOVED_OPTION_CODES.has(code))) {
    return { unsupported: true };
  }
  const sourceFileOf = sourceFileReader(ts);
  return {
    diagnostics: ts.sortAndDeduplicateDiagnostics(
      diagnostics.map((diagnostic) => typeScriptShaped(diagnostic, sourceFileOf)),
    ),
  };
}

function sourceFileReader(ts) {
  const sourceFiles = new Map();
  return (fileName) => {
    if (!sourceFiles.has(fileName)) {
      const text = ts.sys.readFile(fileName);
      const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
      sourceFile.path = ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase();
      sourceFiles.set(fileName, sourceFile);
    }
    return sourceFiles.get(fileName);
  };
}

function typeScriptShaped(diagnostic, sourceFileOf) {
  const located = diagnostic.fileName !== undefined && diagnostic.pos >= 0;
  return {
    file: diagnostic.fileName === undefined ? undefined : sourceFileOf(diagnostic.fileName),
    start: located ? diagnostic.pos : undefined,
    length: located ? diagnostic.end - diagnostic.pos : undefined,
    code: diagnostic.code,
    category: diagnostic.category,
    messageText:
      (diagnostic.messageChain ?? []).length === 0 ? diagnostic.text : messageChain(diagnostic),
  };
}

function messageChain(diagnostic) {
  return {
    messageText: diagnostic.text,
    category: diagnostic.category,
    code: diagnostic.code,
    next: (diagnostic.messageChain ?? []).map(messageChain),
  };
}
