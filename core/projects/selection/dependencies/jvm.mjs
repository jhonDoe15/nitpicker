import path from 'node:path';
import { readTextInside } from '../../discovery/repository-files.mjs';

const GRADLE_SETTINGS = ['settings.gradle', 'settings.gradle.kts'];
const INCLUDE_BUILD = /includeBuild(?:\s*\(\s*(?:file\s*\(\s*)?|\s+)["']([^"']+)["']/gu;
const MAVEN_PATHS = /<(?:module|relativePath)>\s*([^<\s]+)\s*<\/(?:module|relativePath)>/gu;

function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function mavenFolder(target) {
  return target.endsWith('pom.xml') ? path.posix.dirname(target) : target;
}

export function jvmUnit(directory) {
  const gradle = GRADLE_SETTINGS.flatMap((name) =>
    matches(readTextInside(directory, name), INCLUDE_BUILD),
  );
  const maven = matches(readTextInside(directory, 'pom.xml'), MAVEN_PATHS).map(mavenFolder);
  return {
    names: [],
    needs: [],
    folders: [...gradle, ...maven.filter((folder) => folder.startsWith('..'))],
  };
}
