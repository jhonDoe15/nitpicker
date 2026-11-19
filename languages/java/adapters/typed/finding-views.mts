import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../shared/project-files/project-files.mjs';
import {
  hash as untypedHash,
  nextOccurrence as untypedNextOccurrence,
} from '../../../../shared/rules/finding-helpers.mjs';

export const hash: (value: string) => string = untypedHash;
export const nextOccurrence: (occurrences: Map<string, number>, key: string) => number =
  untypedNextOccurrence;
export const projectFilesUnder: (directory: string) => string[] = untypedProjectFilesUnder;
