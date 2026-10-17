import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readGradleSources } from './gradle-sources.mjs';
import { readMavenSources } from './maven-sources.mjs';

function reader(projectRoot) {
  return (file) => {
    const absolute = path.join(projectRoot, file);
    return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
  };
}

export function readBuildSources(projectRoot, files) {
  const readFile = reader(projectRoot);
  return [...readGradleSources(files, readFile), ...readMavenSources(files, readFile)];
}
