import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../shared/filesystem.mjs';

const MAVEN = 'maven';
const GRADLE = 'gradle';
const MAVEN_WRAPPER = 'mvnw';
const GRADLE_WRAPPER = 'gradlew';

export const GRADLE_DIRECTORY = path.resolve(import.meta.dirname, '../gradle');
export const INIT_SCRIPT = path.join(GRADLE_DIRECTORY, 'nitpicker.init.gradle');
export const GRADLE_BUILD_FILES = [
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
  return buildTool === GRADLE || preset !== 'kotlin';
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

export const JAVA_BUILD_TOOLS = [MAVEN, GRADLE];

function presentBuildFiles(projectRoot) {
  return new Set(
    ['pom.xml', MAVEN_WRAPPER, GRADLE_WRAPPER, ...GRADLE_BUILD_FILES].filter((name) =>
      existsSync(pathInside(projectRoot, name) ?? ''),
    ),
  );
}

export function describeJavaBuild(projectRoot) {
  const present = presentBuildFiles(projectRoot);
  const hasGradle = GRADLE_BUILD_FILES.some((name) => present.has(name));
  if (!present.has('pom.xml')) {
    return { tool: GRADLE, both: false };
  }
  if (!hasGradle) {
    return { tool: MAVEN, both: false };
  }
  if (present.has(MAVEN_WRAPPER) && !present.has(GRADLE_WRAPPER)) {
    return { tool: MAVEN, both: true, reason: 'mvnw exists and gradlew does not' };
  }
  const reason = present.has(GRADLE_WRAPPER)
    ? 'gradlew exists'
    : 'a Gradle build file exists and mvnw does not';
  return { tool: GRADLE, both: true, reason };
}

export function detectJavaBuild(projectRoot, configured) {
  return configured ?? describeJavaBuild(projectRoot).tool;
}
