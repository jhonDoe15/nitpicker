import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../../../../shared/filesystem.mts';
import { projectFilePaths as untypedProjectFilePaths } from '../../../../shared/project-files/project-files.mts';
import {
  fileHasGeneratorHeader,
  hasGeneratorMarker,
} from '../../../../shared/conventions/generated/generator-marker.mts';
import { codeExtensionNames, mayBeGenerated } from '../layout.mts';

const projectFilePaths: (root: string) => string[] = untypedProjectFilePaths;

const CODE_FILE = new RegExp(`\\.(?:${codeExtensionNames.join('|')})$`, 'u');

function isMarkedGenerated(projectRoot: string, file: string): boolean {
  const absolute = pathInside(projectRoot, file);
  if (!CODE_FILE.test(file) || absolute === undefined || !existsSync(absolute)) {
    return false;
  }
  return mayBeGenerated(file)
    ? hasGeneratorMarker(readFileSync(absolute, 'utf8')) || fileHasGeneratorHeader(absolute)
    : fileHasGeneratorHeader(absolute);
}

export function markedGeneratedFiles(projectRoot: string): string[] {
  return projectFilePaths(projectRoot).filter((file) => isMarkedGenerated(projectRoot, file));
}
