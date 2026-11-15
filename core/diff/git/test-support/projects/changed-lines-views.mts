import {
  parseChangedLines as parseChangedLinesJs,
  readChangedLines as readChangedLinesJs,
} from '../../patches/changed-lines.mjs';
import { lineMapOf as lineMapOfJs } from '../../unchanged-lines.mjs';

export type ChangedFile = {
  readonly path: string;
  readonly ranges: readonly (readonly [number, number])[];
  readonly [field: string]: unknown;
};

type LineMap = {
  readonly baseLineOf: (line: number) => number | undefined;
  readonly headLineOf: (line: number) => number | undefined;
};

export const lineMapOf: (file: unknown) => LineMap = lineMapOfJs;

export const parseChangedLines: (
  diffText: string,
  projectRelativePath?: string,
  readSources?: () => Map<string, unknown>,
) => Map<string, ChangedFile> = parseChangedLinesJs;

export function changedFile(changes: ReadonlyMap<string, ChangedFile>, name: string): ChangedFile {
  const file = changes.get(name);
  if (file === undefined) {
    throw new Error(`${name} has no changed lines`);
  }
  return file;
}

export const readChangedLines: (request: {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headSha: string;
  readonly projectRelativePath: string;
}) => Map<string, ChangedFile> = readChangedLinesJs;
