import path from 'node:path';
import { readTextInside } from '../../discovery/repository-files.mjs';
import { includedBuilds } from '../../../../languages/java/builds/gradle-scripts/included-builds.mjs';
const MAVEN_PATHS = /<(?:module|relativePath)>\s*([^<\s]+)\s*<\/(?:module|relativePath)>/gu;

function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function mavenFolder(target) {
  return target.endsWith('pom.xml') ? path.posix.dirname(target) : target;
}

export function jvmUnit(directory) {
  const gradle = includedBuilds(directory);
  const maven = matches(readTextInside(directory, 'pom.xml'), MAVEN_PATHS).map(mavenFolder);
  return {
    names: [],
    needs: [],
    folders: [...gradle, ...maven.filter((folder) => folder.startsWith('..'))],
  };
}
