import type TypeScript from 'typescript';
import {
  indentationStyle as untypedIndentationStyle,
  codeLines as untypedCodeLines,
  winner as untypedWinner,
} from '../layout-measures.mjs';
import {
  descendants as untypedDescendants,
  parsedSource as untypedParsedSource,
} from '../measures/typescript-syntax.mjs';

export const indentationStyle: (text: string) => string | undefined = untypedIndentationStyle;

export const codeLines: (text: string) => string[] = untypedCodeLines;

export const winner: (counts: Readonly<Record<string, number>>) => string | undefined =
  untypedWinner;

export const descendants: (ts: typeof TypeScript, root: TypeScript.Node) => TypeScript.Node[] =
  untypedDescendants;

export const parsedSource: (
  text: string,
  file: string,
) => { readonly ts: typeof TypeScript; readonly source: TypeScript.SourceFile } =
  untypedParsedSource;
