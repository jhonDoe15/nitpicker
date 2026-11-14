import type TypeScript from 'typescript';
import { listOf } from '../../../../../shared/values/readers.mts';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../../shared/project-files/project-files.mjs';
import { depthFirst as untypedDepthFirst } from '../../../../../shared/traversal.mjs';
import { syntaxChildren as untypedSyntaxChildren } from '../../syntax/children.mjs';

const walk: <T>(root: T, children: (node: T) => readonly T[]) => Iterable<T> = untypedDepthFirst;

export function depthFirst<T>(root: T, children: (node: T) => readonly T[]): T[] {
  return [...walk(root, children)];
}

export const syntaxChildren: (node: TypeScript.Node) => TypeScript.Node[] = untypedSyntaxChildren;

export const projectFilesUnder: (
  root: string,
  options: {
    readonly skipDirectory: (absolute: string, entry: { readonly name: string }) => boolean;
  },
) => Iterable<string> = untypedProjectFilesUnder;

export function parseDiagnosticsOf(file: TypeScript.SourceFile): readonly TypeScript.Diagnostic[] {
  return 'parseDiagnostics' in file && Array.isArray(file.parseDiagnostics)
    ? listOf(file.parseDiagnostics).filter(isDiagnostic)
    : [];
}

function isDiagnostic(value: unknown): value is TypeScript.Diagnostic {
  return typeof value === 'object' && value !== null && 'messageText' in value;
}

export function isNode(value: unknown): value is TypeScript.Node {
  return typeof value === 'object' && value !== null && 'kind' in value;
}
