import type TypeScript from 'typescript';
import {
  enclosingSymbol as untypedEnclosingSymbol,
  formatDiagnostic as untypedFormatDiagnostic,
  loadTypeScript as loadUntypedTypeScript,
  preEmitDiagnostics as untypedPreEmitDiagnostics,
  projectTypeScript as untypedProjectTypeScript,
  withoutProjectRoot as untypedWithoutProjectRoot,
} from '../typecheck/typescript-program.mjs';

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
