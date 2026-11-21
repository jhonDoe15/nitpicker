import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../shared/project-files/project-files.mts';
import {
  hash as untypedHash,
  occurrenceCounter as untypedOccurrenceCounter,
} from '../../../../shared/rules/finding-parts.mts';

export const hash: (value: string) => string = untypedHash;
export const occurrenceCounter: () => (key: string) => number = untypedOccurrenceCounter;
export const projectFilesUnder: (directory: string) => string[] = untypedProjectFilesUnder;
