import {
  appendAll as untypedAppendAll,
  largest as untypedLargest,
} from '../../../../../shared/lists/items.mjs';
import {
  projectFilePaths as untypedProjectFilePaths,
  projectFilesUnder as untypedProjectFilesUnder,
} from '../../../../../shared/project-files/project-files.mjs';
import { editDistance as untypedEditDistance } from '../../../../../shared/messages/closest-match.mjs';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../../shared/paths/glob.mjs';
import { prefixesOf as untypedPrefixesOf } from '../../../../../shared/paths/prefixes.mjs';

export const escapeRegExp: (text: string) => string = untypedEscapeRegExp;
export const largest: (values: readonly number[]) => number = untypedLargest;
const distanceOf: (left: string, right: string) => number | undefined = untypedEditDistance;
export const projectFilesUnder: (root: string) => string[] = untypedProjectFilesUnder;
export const projectFilePaths: (root: string) => string[] = untypedProjectFilePaths;

export function editDistance(left: string, right: string): number {
  return distanceOf(left, right) ?? Number.POSITIVE_INFINITY;
}
export const prefixesOf: (text: string, separator: string) => string[] = untypedPrefixesOf;
export const appendAll: <T>(target: T[], items: readonly T[]) => T[] = untypedAppendAll;
