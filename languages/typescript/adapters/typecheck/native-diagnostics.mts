import type TypeScript from 'typescript';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveTool } from '../typed/tooling.mts';
import { troubleshootingError } from '../lint-engine/typed/tools.mts';
import { TROUBLESHOOTING_ANCHORS } from '../../../../shared/messages/troubleshooting.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import {
  type Collected,
  type NativeApi,
  type NativeDiagnostic,
  type NativeOutcome,
  type NativeRequest,
  apiConstructorOf,
} from './native-api.mts';

type Started =
  | { readonly api: NativeApi; readonly startError?: undefined }
  | {
      readonly api?: undefined;
      readonly startError: unknown;
    };

type SourceFileOf = (fileName: string) => TypeScript.SourceFile;

const NO_INPUTS_CODE = 18003;
const REMOVED_OPTION_CODES = new Set([5102, 5108]);
const NON_FATAL_CONFIG_CODES = new Set([5023, 5025]);
const ENGINE_HINT =
  'Set "tools": { "typescript": { "engine": "project" } } in nitpicker.config.json ' +
  "to type check with the project's own TypeScript instead.";

export function apiEntry(
  versions: Readonly<Record<string, string | undefined>> = process.versions,
): string {
  return versions['deno'] === undefined && versions['bun'] === undefined
    ? 'typescript/unstable/sync'
    : 'typescript/unstable/async';
}

export async function nativeDiagnostics({
  ts,
  configPath,
  projectRoot,
  apiRoot,
  engineHint,
  entry = apiEntry(),
}: NativeRequest): Promise<NativeOutcome> {
  const own = apiRoot !== undefined;
  const { api, startError } = await startedApi({ projectRoot, apiRoot, entry });
  if (api === undefined) {
    if (own) {
      throw ownStartError(startError);
    }
    return { unsupported: true, cause: startError };
  }
  let collected: Collected;
  try {
    collected = await collectedDiagnostics(api, configPath);
  } catch (error) {
    const hint = own || !engineHint ? '' : `\n${ENGINE_HINT}`;
    throw troubleshootingError(
      `TypeScript 7 type check failed: ${String(fieldOf(error, 'message'))}${hint}`,
      hint === '' ? undefined : TROUBLESHOOTING_ANCHORS.engineUnavailable,
      { cause: error },
    );
  } finally {
    await api.close();
  }
  return own ? ownDiagnostics(ts, collected) : settledDiagnostics(ts, collected);
}

function ownStartError(cause: unknown): Error {
  return new Error(
    `The project's TypeScript 7 compiler did not start: ${String(fieldOf(cause, 'message'))}. ` +
      'Install the typescript package with its platform binary.',
    { cause },
  );
}

async function startedApi({
  projectRoot,
  apiRoot = resolveTool('@typescript/native').root,
  entry,
}: {
  readonly projectRoot: string;
  readonly apiRoot: string | undefined;
  readonly entry: string;
}): Promise<Started> {
  const apiPath = createRequire(path.join(apiRoot, 'package.json')).resolve(entry);
  let api: NativeApi | undefined;
  try {
    const API = apiConstructorOf(await import(pathToFileURL(apiPath).href));
    api = new API({ cwd: projectRoot });
    await api.ensureInitialized();
    return { api };
  } catch (error) {
    await api?.close();
    return { startError: error };
  }
}

async function collectedDiagnostics(api: NativeApi, configPath: string): Promise<Collected> {
  const snapshot = await api.updateSnapshot({ openProjects: [configPath] });
  const [project] = snapshot.getProjects();
  if (project === undefined) {
    throw new Error(`TypeScript 7 opened no project for ${configPath}`);
  }
  const { program, compilerOptions } = project;
  const emitsDeclarations =
    compilerOptions['declaration'] === true || compilerOptions['composite'] === true;
  const requests = [
    () => program.getSyntacticDiagnostics(),
    () => program.getGlobalDiagnostics(),
    () => program.getBindDiagnostics(),
    () => program.getSemanticDiagnostics(),
    ...(emitsDeclarations ? [() => program.getDeclarationDiagnostics()] : []),
  ];
  const configErrors = (await program.getConfigFileParsingDiagnostics()).map((diagnostic) =>
    withoutRootConfigLocation(diagnostic, configPath),
  );
  const diagnostics = (await program.getProgramDiagnostics()).map(withoutConfigLocation);
  for (const request of requests) {
    diagnostics.push(...(await request()));
  }
  return { hasRootFiles: project.rootFiles.length > 0, configErrors, diagnostics };
}

function withoutRootConfigLocation(
  diagnostic: NativeDiagnostic,
  configPath: string,
): NativeDiagnostic {
  return diagnostic.fileName !== undefined &&
    path.resolve(diagnostic.fileName) === path.resolve(configPath)
    ? { ...diagnostic, fileName: undefined, pos: -1, end: -1 }
    : diagnostic;
}

function withoutConfigLocation(diagnostic: NativeDiagnostic): NativeDiagnostic {
  return diagnostic.fileName?.endsWith('.json') === true
    ? { ...diagnostic, fileName: undefined, pos: -1, end: -1 }
    : diagnostic;
}

function settledDiagnostics(
  ts: typeof TypeScript,
  { hasRootFiles, configErrors, diagnostics }: Collected,
): NativeOutcome {
  if (!hasRootFiles && configErrors.every(({ code }) => code === NO_INPUTS_CODE)) {
    return { diagnostics: [] };
  }
  if (configErrors.length > 0 || diagnostics.some(({ code }) => REMOVED_OPTION_CODES.has(code))) {
    return { unsupported: true };
  }
  return shapedDiagnostics(ts, diagnostics);
}

function ownDiagnostics(
  ts: typeof TypeScript,
  { hasRootFiles, configErrors, diagnostics }: Collected,
): NativeOutcome {
  const fatalErrors = configErrors.filter(
    ({ code }) => code !== NO_INPUTS_CODE && !isNonFatalConfigCode(code),
  );
  if (fatalErrors.length > 0) {
    throw configFailure(fatalErrors.map(({ text }) => text).join('\n'));
  }
  const reported = configErrors.filter(({ code }) => code !== NO_INPUTS_CODE);
  return shapedDiagnostics(ts, hasRootFiles ? diagnostics : [], reported);
}

export function isNonFatalConfigCode(code: number): boolean {
  return NON_FATAL_CONFIG_CODES.has(code);
}

export function configFailure(message: string): Error & { readonly configError: true } {
  return Object.assign(new Error(message), { configError: true as const });
}

function shapedDiagnostics(
  ts: typeof TypeScript,
  diagnostics: readonly NativeDiagnostic[],
  configErrors: readonly NativeDiagnostic[] = [],
): NativeOutcome {
  const sourceFileOf = sourceFileReader(ts, { withPath: true });
  const configFileOf = sourceFileReader(ts, { withPath: false });
  return {
    diagnostics: ts.sortAndDeduplicateDiagnostics([
      ...configErrors.map((diagnostic) => typeScriptShaped(diagnostic, configFileOf)),
      ...diagnostics.map((diagnostic) => typeScriptShaped(diagnostic, sourceFileOf)),
    ]),
  };
}

function sourceFileReader(
  ts: typeof TypeScript,
  { withPath }: { readonly withPath: boolean },
): SourceFileOf {
  const sourceFiles = new Map<string, TypeScript.SourceFile>();
  return (fileName) => {
    const known = sourceFiles.get(fileName);
    if (known !== undefined) {
      return known;
    }
    const text = ts.sys.readFile(fileName);
    if (text === undefined) {
      throw new Error(`TypeScript 7 reported a diagnostic in ${fileName}, which cannot be read`);
    }
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    if (withPath) {
      Object.assign(sourceFile, {
        path: ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
      });
    }
    sourceFiles.set(fileName, sourceFile);
    return sourceFile;
  };
}

function typeScriptShaped(
  diagnostic: NativeDiagnostic,
  sourceFileOf: SourceFileOf,
): TypeScript.Diagnostic {
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

function messageChain(diagnostic: NativeDiagnostic): TypeScript.DiagnosticMessageChain {
  return {
    messageText: diagnostic.text,
    category: diagnostic.category,
    code: diagnostic.code,
    next: (diagnostic.messageChain ?? []).map(messageChain),
  };
}
