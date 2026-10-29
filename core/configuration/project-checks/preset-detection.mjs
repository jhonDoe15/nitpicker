import { existsSync } from 'node:fs';
import path from 'node:path';
import { configError } from '../../../shared/config.mjs';
import { filesUnder, pathInside } from '../../../shared/filesystem.mjs';
import { sourceRoots as defaultSourceRoots } from '../../../languages/typescript/preset/layout.mjs';
import { firstJsxFile } from './project-config.mjs';
import {
  BUILD_LOGIC_FOLDERS,
  gradleAppliesKotlin,
} from '../../../languages/java/builds/gradle-scripts/kotlin-plugin.mjs';

const PROJECT_MARKERS = [
  {
    preset: 'java',
    label: 'Gradle or Maven',
    files: [
      'pom.xml',
      'build.gradle',
      'build.gradle.kts',
      'settings.gradle',
      'settings.gradle.kts',
    ],
  },
  {
    preset: 'python',
    label: 'Python',
    files: ['pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile', 'requirements.txt'],
  },
];
const SCRIPT_FILE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u;
const TYPESCRIPT_OR_JSX_FILE = /\.(?:ts|tsx|mts|cts|jsx)$/u;
const KOTLIN_FILE = /\.kt$/u;
const JAVA_FILE = /\.java$/u;
const MINIFIED_FILE = /\.min\.[cm]?js$/u;
const SKIPPED_FOLDERS = new Set(['node_modules', 'build', 'target', 'out']);
const JVM_SKIPPED_FOLDERS = new Set([...SKIPPED_FOLDERS, ...BUILD_LOGIC_FOLDERS]);
const ASSET_FOLDERS = new Set([
  ...SKIPPED_FOLDERS,
  'resources',
  'static',
  'public',
  'assets',
  'webapp',
  'wwwroot',
]);

function codeFiles(directory, skippedFolders = SKIPPED_FOLDERS) {
  if (!existsSync(directory)) {
    return [];
  }
  return [
    ...filesUnder(directory, {
      skipDirectory: (_absolute, entry) =>
        entry.name.startsWith('.') || skippedFolders.has(entry.name),
    }),
  ].map((file) => path.basename(file));
}

export function detectedPreset(projectRoot) {
  const marker = PROJECT_MARKERS.flatMap(({ preset, label, files }) =>
    files
      .filter((file) => existsSync(pathInside(projectRoot, file) ?? ''))
      .map((file) => ({ preset, label, file })),
  )[0];
  if (marker?.preset !== 'java') {
    return marker;
  }
  const files = codeFiles(projectRoot, JVM_SKIPPED_FOLDERS);
  const kotlin = files.filter((name) => KOTLIN_FILE.test(name)).length;
  const java = files.filter((name) => JAVA_FILE.test(name)).length;
  const kotlinBuild = kotlin > 0 && (kotlin > java || gradleAppliesKotlin(projectRoot));
  return {
    ...marker,
    preset: kotlinBuild ? 'kotlin' : 'java',
    javaSources: java > 0,
    kotlinSources: kotlin > 0,
  };
}

function projectScripts(config, projectRoot) {
  const roots = config.layout?.sourceRoots ?? defaultSourceRoots;
  return roots
    .flatMap((root) => codeFiles(path.join(projectRoot, root), ASSET_FOLDERS))
    .filter((name) => SCRIPT_FILE.test(name) && !MINIFIED_FILE.test(name));
}

export function scriptProjectPreset(config, projectRoot) {
  const scripts = projectScripts(config, projectRoot);
  const ownedByOtherPreset =
    detectedPreset(projectRoot) !== undefined &&
    !existsSync(path.join(projectRoot, 'package.json'));
  if (scripts.length === 0 || ownedByOtherPreset) {
    return undefined;
  }
  const typed =
    existsSync(path.join(projectRoot, 'tsconfig.json')) ||
    scripts.some((name) => TYPESCRIPT_OR_JSX_FILE.test(name)) ||
    firstJsxFile(config, projectRoot) !== undefined;
  return typed ? 'typescript' : 'javascript';
}

export function presetToDeclare(config, projectRoot) {
  return projectScripts(config, projectRoot).length > 0 ? undefined : detectedPreset(projectRoot);
}

export function javascriptPresetHint(config, projectRoot) {
  if (config.preset !== undefined || scriptProjectPreset(config, projectRoot) !== 'javascript') {
    return undefined;
  }
  return 'no "preset" is set, so the TypeScript preset runs, but these sources are JavaScript (no TypeScript files or tsconfig.json). Add "preset": "javascript" to nitpicker.config.json, or run `nitpicker init`.';
}

export function rejectUndeclaredPreset(config, projectRoot) {
  if (config.preset !== undefined) {
    return;
  }
  const detected = presetToDeclare(config, projectRoot);
  if (detected !== undefined) {
    const roots = config.layout?.sourceRoots ?? defaultSourceRoots;
    throw configError(
      `no "preset" is set, so the TypeScript preset would run, but this is a ${detected.label} project (${detected.file}) with no TypeScript or JavaScript sources under ${roots.join(', ')}. Add "preset": "${detected.preset}" to nitpicker.config.json (create the file if there is none).`,
    );
  }
}
