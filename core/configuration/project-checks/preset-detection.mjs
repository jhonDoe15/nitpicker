import { existsSync } from 'node:fs';
import path from 'node:path';
import { configError } from '../../../shared/config.mjs';
import { pathInside } from '../../../shared/filesystem.mjs';
import { projectFilesUnder } from '../../../shared/project-files/project-files.mjs';
import { sourceRoots as defaultSourceRoots } from '../../../languages/typescript/preset/layout.mjs';

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
  {
    preset: 'go',
    label: 'Go',
    files: ['go.mod'],
  },
];
const SCRIPT_FILE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u;
const KOTLIN_FILE = /\.kts?$/u;
const JAVA_FILE = /\.java$/u;
const MINIFIED_FILE = /\.min\.[cm]?js$/u;
const SKIPPED_FOLDERS = new Set(['node_modules', 'build', 'target', 'out']);
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
    ...projectFilesUnder(directory, {
      skipDirectory: (_absolute, entry) =>
        entry.name.startsWith('.') || skippedFolders.has(entry.name),
    }),
  ].map((file) => path.basename(file));
}

function detectedPreset(projectRoot) {
  const marker = PROJECT_MARKERS.flatMap(({ preset, label, files }) =>
    files
      .filter((file) => existsSync(pathInside(projectRoot, file) ?? ''))
      .map((file) => ({ preset, label, file })),
  )[0];
  if (marker?.preset !== 'java') {
    return marker;
  }
  const files = codeFiles(projectRoot);
  const kotlin = files.filter((name) => KOTLIN_FILE.test(name)).length;
  const java = files.filter((name) => JAVA_FILE.test(name)).length;
  return kotlin > java ? { ...marker, preset: 'kotlin' } : marker;
}

export function presetToDeclare(config, projectRoot) {
  const roots = config.layout?.sourceRoots ?? defaultSourceRoots;
  const hasScripts = roots.some((root) =>
    codeFiles(path.join(projectRoot, root), ASSET_FOLDERS).some(
      (name) => SCRIPT_FILE.test(name) && !MINIFIED_FILE.test(name),
    ),
  );
  return hasScripts ? undefined : detectedPreset(projectRoot);
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
