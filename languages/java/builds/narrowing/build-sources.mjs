import { readInside } from '../../../../shared/conventions/read-inside.mjs';
import { readGradleSources } from './gradle-sources.mjs';
import { readMavenSources } from './maven-sources.mjs';

export function readBuildSources(projectRoot, files) {
  return [
    ...readGradleSources(files, (file) => readInside(projectRoot, file, 'utf8')),
    ...readMavenSources(files, (file) => readInside(projectRoot, file, 'utf8')),
  ];
}
