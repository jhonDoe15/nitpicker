import {
  firstProjectFile as untypedFirstProjectFile,
  readInside as untypedReadInside,
} from '../../../../../shared/conventions/read-inside.mts';
import { largest as untypedLargest } from '../../../../../shared/lists/items.mjs';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../../shared/paths/glob.mts';

export const firstProjectFile: (root: string, names: readonly string[]) => string | undefined =
  untypedFirstProjectFile;

export function readInside(root: string, relative: string, encoding: 'utf8'): string | undefined {
  const text: unknown = untypedReadInside(root, relative, encoding);
  return typeof text === 'string' ? text : undefined;
}

export const largest: (values: readonly number[]) => number = untypedLargest;

export const escapeRegExp: (text: string) => string = untypedEscapeRegExp;
