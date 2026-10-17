import { readInside } from '../../../../shared/conventions/read-inside.mjs';
import { readGradleSources } from './gradle-sources.mjs';
import { readMavenSources } from './maven-sources.mjs';

export function readBuildSources(projectRoot, files) {
  const readFile = (file) => readInside(projectRoot, file, 'utf8');
  return [...readGradleSources(files, readFile), ...readMavenSources(files, readFile)];
}
