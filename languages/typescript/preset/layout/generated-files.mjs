import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { projectFilePaths } from '../../../../shared/project-files/project-files.mjs';
import {
  fileHasGeneratorHeader,
  hasGeneratorMarker,
} from '../../../../shared/conventions/generator-marker.mjs';
import { codeExtensionNames, mayBeGenerated } from '../layout.mjs';

const CODE_FILE = new RegExp(`\\.(?:${codeExtensionNames.join('|')})$`, 'u');

export function isMarkedGenerated(projectRoot, file) {
  const absolute = pathInside(projectRoot, file);
  if (!CODE_FILE.test(file) || absolute === undefined || !existsSync(absolute)) {
    return false;
  }
  return mayBeGenerated(file)
    ? hasGeneratorMarker(readFileSync(absolute, 'utf8')) || fileHasGeneratorHeader(absolute)
    : fileHasGeneratorHeader(absolute);
}

export function markedGeneratedFiles(projectRoot) {
  return projectFilePaths(projectRoot).filter((file) => isMarkedGenerated(projectRoot, file));
}
