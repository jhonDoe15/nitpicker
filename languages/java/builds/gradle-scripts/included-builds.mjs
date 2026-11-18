import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../../../shared/filesystem.mjs';
import { containedPath } from '../../../../shared/paths/contained-path.mjs';
import { BUILD_LOGIC_FOLDERS } from './kotlin-plugin.mjs';

const GRADLE_SETTINGS = ['settings.gradle', 'settings.gradle.kts'];
const INCLUDE_BUILD = /includeBuild(?:\s*\(\s*(?:file\s*\(\s*)?|\s+)["']([^"']+)["']/gu;
const SUBPROJECT_INCLUDE = /(?:^|[\s;])include\s*(?:\(\s*)?["']/mu;
const JVM_SOURCE = /\.(?:java|kt)$/u;
const SKIPPED_FOLDERS = new Set(['build', 'node_modules', 'out', 'target', ...BUILD_LOGIC_FOLDERS]);

function settingsFiles(directory) {
  return GRADLE_SETTINGS.map((name) =>
    containedPath(directory, name, { outside: (relative) => `${relative} leaves ${directory}` }),
  ).filter((file) => existsSync(file));
}

function settingsText(directory) {
  return settingsFiles(directory)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

export function hasGradleSettings(directory) {
  return settingsFiles(directory).length > 0;
}

export function includedBuilds(directory) {
  return [...settingsText(directory).matchAll(INCLUDE_BUILD)].flatMap(([, folder]) =>
    folder === undefined ? [] : [folder],
  );
}

export function includesSubprojects(directory) {
  return SUBPROJECT_INCLUDE.test(settingsText(directory));
}

export function hasJvmSources(directory) {
  if (!existsSync(directory)) {
    return false;
  }
  const files = filesUnder(directory, {
    skipDirectory: (_absolute, entry) =>
      entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name),
  });
  for (const file of files) {
    if (JVM_SOURCE.test(file)) {
      return true;
    }
  }
  return false;
}

export function includedSourceBuilds(directory) {
  const folders = includedBuilds(directory)
    .map((written) => path.posix.normalize(written.replaceAll('\\', '/')).replace(/\/+$/u, ''))
    .filter(
      (folder) =>
        folder !== '.' &&
        !folder.startsWith('..') &&
        !path.posix.isAbsolute(folder) &&
        !BUILD_LOGIC_FOLDERS.includes(path.posix.basename(folder)) &&
        hasGradleSettings(path.join(directory, folder)) &&
        hasJvmSources(path.join(directory, folder)),
    );
  return [...new Set(folders)].toSorted();
}
