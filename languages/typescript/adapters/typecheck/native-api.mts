import type TypeScript from 'typescript';
import { fieldOf } from '../../../../shared/values/readers.mts';

type Awaitable<T> = T | Promise<T>;

export type NativeDiagnostic = {
  readonly fileName?: string | undefined;
  readonly pos: number;
  readonly end: number;
  readonly code: number;
  readonly category: TypeScript.DiagnosticCategory;
  readonly text: string;
  readonly messageChain?: readonly NativeDiagnostic[];
};

type DiagnosticRequest = () => Awaitable<readonly NativeDiagnostic[]>;

type NativeProgram = {
  readonly getSyntacticDiagnostics: DiagnosticRequest;
  readonly getGlobalDiagnostics: DiagnosticRequest;
  readonly getBindDiagnostics: DiagnosticRequest;
  readonly getSemanticDiagnostics: DiagnosticRequest;
  readonly getDeclarationDiagnostics: DiagnosticRequest;
  readonly getConfigFileParsingDiagnostics: DiagnosticRequest;
  readonly getProgramDiagnostics: DiagnosticRequest;
};

type NativeProject = {
  readonly program: NativeProgram;
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  readonly rootFiles: readonly string[];
};

export type NativeApi = {
  ensureInitialized(): Awaitable<void>;
  close(): Awaitable<void>;
  updateSnapshot(request: {
    readonly openProjects: readonly string[];
  }): Awaitable<{ getProjects(): readonly NativeProject[] }>;
};

type NativeApiConstructor = new (options: { readonly cwd: string }) => NativeApi;

export type Collected = {
  readonly hasRootFiles: boolean;
  readonly configErrors: readonly NativeDiagnostic[];
  readonly diagnostics: readonly NativeDiagnostic[];
};

export type NativeOutcome =
  | { readonly diagnostics: readonly TypeScript.Diagnostic[]; readonly unsupported?: undefined }
  | { readonly unsupported: true; readonly cause?: unknown; readonly diagnostics?: undefined };

export type NativeRequest = {
  readonly ts: typeof TypeScript;
  readonly configPath: string;
  readonly projectRoot: string;
  readonly apiRoot?: string | undefined;
  readonly engineHint: boolean;
  readonly entry?: string;
};

function isApiConstructor(value: unknown): value is NativeApiConstructor {
  return typeof value === 'function';
}

export function apiConstructorOf(module: unknown): NativeApiConstructor {
  const api = fieldOf(module, 'API');
  if (!isApiConstructor(api)) {
    throw new TypeError('The TypeScript 7 API module has no API class');
  }
  return api;
}
