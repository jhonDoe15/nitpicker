import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';

const NO_INPUTS_CODE = 18003;
const REMOVED_OPTION_CODES = new Set([5102, 5108]);
const NON_FATAL_CONFIG_CODES = new Set([5023, 5025]);
const ENGINE_HINT =
  'Set "tools": { "typescript": { "engine": "project" } } in nitpicker.config.json ' +
  "to type check with the project's own TypeScript instead.";

export async function nativeDiagnostics({
  ts,
  configPath,
  projectRoot,
  apiRoot,
  engineHint = true,
}) {
  const own = apiRoot !== undefined;
  const { api, startError } = await startedApi(projectRoot, apiRoot);
  if (startError !== undefined) {
    if (own) {
      throw ownStartError(startError);
    }
    return { unsupported: true, cause: startError };
  }
  let collected;
  try {
    collected = collectedDiagnostics(api, configPath);
  } catch (error) {
    const hint = own || !engineHint ? '' : `\n${ENGINE_HINT}`;
    throw new Error(`TypeScript 7 type check failed: ${String(error.message)}${hint}`, {
      cause: error,
    });
  } finally {
    api.close();
  }
  return own ? ownDiagnostics(ts, collected) : settledDiagnostics(ts, collected);
}

function ownStartError(cause) {
  return new Error(
    `The project's TypeScript 7 compiler did not start: ${String(cause.message)}. ` +
      'Install the typescript package with its platform binary.',
    { cause },
  );
}

async function startedApi(projectRoot, apiRoot = resolveTool('typescript-native').root) {
  const apiPath = createRequire(path.join(apiRoot, 'package.json')).resolve(
    'typescript/unstable/sync',
  );
  const { API } = await import(pathToFileURL(apiPath).href);
  try {
    return { api: new API({ cwd: projectRoot }) };
  } catch (error) {
    return { startError: error };
  }
}

function collectedDiagnostics(api, configPath) {
  const [project] = api.updateSnapshot({ openProjects: [configPath] }).getProjects();
  const { program, compilerOptions } = project;
  const emitsDeclarations =
    compilerOptions.declaration === true || compilerOptions.composite === true;
  return {
    hasRootFiles: project.rootFiles.length > 0,
    configErrors: program
      .getConfigFileParsingDiagnostics()
      .map((diagnostic) => withoutRootConfigLocation(diagnostic, configPath)),
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

function withoutRootConfigLocation(diagnostic, configPath) {
  return diagnostic.fileName !== undefined &&
    path.resolve(diagnostic.fileName) === path.resolve(configPath)
    ? { ...diagnostic, fileName: undefined, pos: -1, end: -1 }
    : diagnostic;
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
  return shapedDiagnostics(ts, diagnostics);
}

function ownDiagnostics(ts, { hasRootFiles, configErrors, diagnostics }) {
  const fatalErrors = configErrors.filter(
    ({ code }) => code !== NO_INPUTS_CODE && !isNonFatalConfigCode(code),
  );
  if (fatalErrors.length > 0) {
    throw configFailure(fatalErrors.map(({ text }) => text).join('\n'));
  }
  if (!hasRootFiles) {
    return { diagnostics: [] };
  }
  return {
    diagnostics: [
      ...shapedDiagnostics(ts, configErrors).diagnostics,
      ...shapedDiagnostics(ts, diagnostics).diagnostics,
    ],
  };
}

export function isNonFatalConfigCode(code) {
  return NON_FATAL_CONFIG_CODES.has(code);
}

export function configFailure(message) {
  return Object.assign(new Error(message), { configError: true });
}

function shapedDiagnostics(ts, diagnostics) {
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
