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

const PIT_MUTATOR = /^'[A-Z_]+'$/u;

export function readPitMutators(initScript = INIT_SCRIPT) {
  const block = /def pitMutators = \[([^\]]*)\]/u.exec(readFileSync(initScript, 'utf8'));
  const entries = (block?.[1] ?? '').split(',').map((entry) => entry.trim());
  const names = entries.at(-1) === '' ? entries.slice(0, -1) : entries;
  if (names.length === 0 || !names.every((name) => PIT_MUTATOR.test(name))) {
    throw new Error(
      `No PIT mutators found in ${initScript}: list them as quoted names in def pitMutators`,
    );
  }
  return names.map((name) => name.slice(1, -1));
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
