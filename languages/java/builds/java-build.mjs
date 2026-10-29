import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../../shared/filesystem.mjs';

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

const GRADLE_SCRIPT = /\.gradle(?:\.kts)?$/u;
const KOTLIN_PLUGIN =
  /\bkotlin\s*\(\s*["'](?:jvm|android|multiplatform)["']\s*\)|["']org\.jetbrains\.kotlin\.(?:jvm|android|multiplatform)["']|\bapply\s+plugin\s*:\s*["']kotlin(?:-android)?["']|\bid\s*\(?\s*["']kotlin["']/u;
const SKIPPED_FOLDERS = new Set(['build', 'node_modules', 'out', 'target']);

export function gradleAppliesKotlin(projectRoot) {
  const scripts = filesUnder(projectRoot, {
    skipDirectory: (_absolute, entry) =>
      entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name),
  });
  return [...scripts]
    .filter((file) => GRADLE_SCRIPT.test(file))
    .some((file) => KOTLIN_PLUGIN.test(readFileSync(file, 'utf8')));
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
