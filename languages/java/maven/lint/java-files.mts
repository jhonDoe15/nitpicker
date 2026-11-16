import { projectFilesUnder as untypedFilesUnder } from '../../../../shared/project-files/project-files.mjs';

const projectFilesUnder: (root: string) => string[] = untypedFilesUnder;

export function javaFiles(roots: readonly string[]): string[] {
  return roots
    .flatMap((root) => projectFilesUnder(root).filter((file) => file.endsWith('.java')))
    .sort();
}
