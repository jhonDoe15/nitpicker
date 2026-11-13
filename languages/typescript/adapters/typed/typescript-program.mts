import type TypeScript from 'typescript';
import {
  enclosingSymbol as untypedEnclosingSymbol,
  formatDiagnostic as untypedFormatDiagnostic,
  loadTypeScript as loadUntypedTypeScript,
  preEmitDiagnostics as untypedPreEmitDiagnostics,
  projectTypeScript as untypedProjectTypeScript,
  withoutProjectRoot as untypedWithoutProjectRoot,
} from '../typecheck/typescript-program.mjs';
import { ts as untypedTs } from '../../typescript-api/typescript-api.mjs';

type ProjectTypeScript = { readonly ts: typeof TypeScript; readonly native?: string };

export type PreEmitRequest = {
  readonly ts: typeof TypeScript;
  readonly engine: string;
  readonly configPath: string;
  readonly configName: string;
  readonly projectRoot: string;
  readonly projectNative: string | undefined;
};

export const projectTypeScript: (projectRoot: string) => ProjectTypeScript =
  untypedProjectTypeScript;

export const loadTypeScript: (projectRoot?: string) => typeof TypeScript = loadUntypedTypeScript;

export const preEmitDiagnostics: (request: PreEmitRequest) => Promise<TypeScript.Diagnostic[]> =
  untypedPreEmitDiagnostics;

export const enclosingSymbol: (
  ts: typeof TypeScript,
  sourceFile: TypeScript.SourceFile,
  position: number,
) => string | undefined = untypedEnclosingSymbol;

export const formatDiagnostic: (
  ts: typeof TypeScript,
  diagnostic: TypeScript.Diagnostic,
) => string = untypedFormatDiagnostic;

export const withoutProjectRoot: (message: string, projectRoot: string) => string =
  untypedWithoutProjectRoot;

function isTypeScriptApi(value: unknown): value is typeof TypeScript {
  return typeof value === 'object' && value !== null && 'createSourceFile' in value;
}

export function typescriptApi(): typeof TypeScript {
  const api: unknown = untypedTs;
  if (!isTypeScriptApi(api)) {
    throw new TypeError('The selected TypeScript API does not load');
  }
  return api;
}
