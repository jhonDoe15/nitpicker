import {
  formatAgnosticText,
  sourceLanguage,
  sourceLines,
} from '../../../shared/source-text/format-tokens.mts';
import { movedLines } from '../../../shared/source-text/scope-moves.mts';
import { alignSequences } from '../../../shared/source-text/token-alignment.mts';
import type {
  DescribedLine,
  MovedContext,
} from '../../../shared/source-text/typed/source-types.mts';
import { chainOf } from '../../../shared/traversal.mts';

export type SourceLanguage = { readonly name: string };

export type LineToken = { readonly text: string; readonly line: number };

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
