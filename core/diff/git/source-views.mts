import {
  formatAgnosticText,
  sourceLanguage,
  sourceLines,
} from '../../../shared/source-text/format-tokens.mjs';
import { movedLines } from '../../../shared/source-text/scope-moves.mjs';
import { alignSequences } from '../../../shared/source-text/token-alignment.mjs';
import { chainOf } from '../../../shared/traversal.mjs';

export type SourceLanguage = { readonly name: string };

export type DescribedLine = {
  readonly scope: string;
  readonly level: number;
  readonly tokens: readonly string[];
  readonly key: string;
};

export type LineToken = { readonly text: string; readonly line: number };

export type MovedContext = {
  readonly sides: {
    readonly base: readonly (DescribedLine | undefined)[];
    readonly head: readonly (DescribedLine | undefined)[];
  };
  readonly inBase: ReadonlySet<number>;
  readonly inHead: ReadonlySet<number>;
  readonly anchorOf: (line: number) => number;
};

function isSourceLanguage(value: unknown): value is SourceLanguage {
  return typeof value === 'object' && value !== null && 'name' in value;
}

export function languageOfPath(filePath: string): SourceLanguage | undefined {
  const found: unknown = sourceLanguage(filePath);
  return isSourceLanguage(found) ? found : undefined;
}

export const describedLinesOf: (
  text: string,
  language: SourceLanguage,
) => readonly (DescribedLine | undefined)[] | undefined = sourceLines;

export const movedLinesOf: (context: MovedContext) => Map<number, number> = movedLines;

const alignPairs: (
  left: readonly LineToken[],
  right: readonly LineToken[],
  maxEdits: number,
) => readonly (readonly number[])[] | undefined = alignSequences;

export function alignedPairs(
  left: readonly LineToken[],
  right: readonly LineToken[],
  maxEdits: number,
): [number, number][] | undefined {
  return alignPairs(left, right, maxEdits)?.map(([leftIndex = 0, rightIndex = 0]) => [
    leftIndex,
    rightIndex,
  ]);
}

export const agnosticTextOf: (text: string, filePath: string) => string = formatAgnosticText;

export const chainFrom: <T>(start: T, next: (node: T) => T | undefined) => T[] = chainOf;
