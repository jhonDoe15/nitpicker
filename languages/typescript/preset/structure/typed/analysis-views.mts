import type TypeScript from 'typescript';
import type { StructureLayout } from './structure-types.mts';
import { depthFirst as untypedDepthFirst } from '../../../../../shared/traversal.mjs';
import { syntaxChildren as untypedSyntaxChildren } from '../../syntax/children.mjs';
import {
  isExcludedPath as untypedIsExcludedPath,
  normalizePath as untypedNormalizePath,
} from '../../dependency-graph/cruise.mjs';
import { defaultResolvedLayout as untypedDefaultResolvedLayout } from '../../layout.mjs';

function isDiagnostics(value: unknown): value is readonly TypeScript.Diagnostic[] {
  return Array.isArray(value);
}

export function parseDiagnosticsOf(
  sourceFile: TypeScript.SourceFile,
): readonly TypeScript.Diagnostic[] {
  const found: unknown = Reflect.get(sourceFile, 'parseDiagnostics');
  return isDiagnostics(found) ? found : [];
}

export const depthFirst: <Item>(
  root: Item,
  children: (item: Item) => readonly Item[],
) => Iterable<Item> = untypedDepthFirst;

export const syntaxChildren: (node: TypeScript.Node) => TypeScript.Node[] = untypedSyntaxChildren;

export const isExcludedPath: (value: string) => boolean = untypedIsExcludedPath;

export const normalizePath: (value: string) => string = untypedNormalizePath;

export const defaultResolvedLayout: StructureLayout = untypedDefaultResolvedLayout;
