import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const GRADLE_DIRECTORY = path.resolve(import.meta.dirname, '../gradle');
export const INIT_SCRIPT = path.join(GRADLE_DIRECTORY, 'nitpicker.init.gradle');
const GRADLE_BUILD_FILES = [
  'settings.gradle',
  'settings.gradle.kts',
  'build.gradle',
  'build.gradle.kts',
];

export function readPinnedTools(initScript = INIT_SCRIPT) {
  const block = /def pinned = \[([^\]]*)\]/u.exec(readFileSync(initScript, 'utf8'));
  const pinned = Object.fromEntries(
    [...(block?.[1] ?? '').matchAll(/(\w+)\s*:\s*'([^']+)'/gu)].map(([, name, version]) => [
      name,
      version,
    ]),
  );
  if (Object.keys(pinned).length === 0) {
    throw new Error(`No pinned tool versions found in ${initScript}`);
  }
  return pinned;
}

export function buildRunsPreset(buildTool, preset) {
  return buildTool === 'gradle' || preset !== 'kotlin';
}

export function detectJavaBuild(projectRoot) {
  const present = new Set(
    ['pom.xml', 'mvnw', 'gradlew', ...GRADLE_BUILD_FILES].filter((name) =>
      existsSync(path.join(projectRoot, name)),
    ),
  );
  if (!present.has('pom.xml')) {
    return 'gradle';
  }
  if (!GRADLE_BUILD_FILES.some((name) => present.has(name))) {
    return 'maven';
  }
  return present.has('mvnw') && !present.has('gradlew') ? 'maven' : 'gradle';
}
