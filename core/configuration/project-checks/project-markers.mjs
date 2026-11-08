import { existsSync } from 'node:fs';
import { configError } from '../../../shared/config.mjs';
import { filesUnder, pathInside } from '../../../shared/filesystem.mjs';

const JVM_MARKERS = {
  preset: 'java',
  label: 'Gradle or Maven',
  files: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
};
const PYTHON_MARKERS = {
  preset: 'python',
  label: 'Python',
  files: ['pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile', 'requirements.txt'],
};
const GO_MARKERS = { preset: 'go', label: 'Go', files: ['go.mod'] };

export const PROJECT_MARKERS = [JVM_MARKERS, PYTHON_MARKERS, GO_MARKERS];

const PRESET_MARKERS = new Map([
  ['java', JVM_MARKERS],
  ['kotlin', JVM_MARKERS],
  ['python', PYTHON_MARKERS],
  ['go', GO_MARKERS],
]);
const PYTHON_FILE = /\.py$/u;
const SKIPPED_PYTHON_FOLDERS = new Set([
  'node_modules',
  'venv',
  'env',
  'site-packages',
  '__pycache__',
  'build',
  'dist',
  'target',
]);

export function markerFilesIn(projectRoot, files) {
  return files.filter((file) => existsSync(pathInside(projectRoot, file) ?? ''));
}

function firstPythonFile(projectRoot) {
  const files = filesUnder(projectRoot, {
    skipDirectory: (_absolute, entry) =>
      entry.name.startsWith('.') || SKIPPED_PYTHON_FOLDERS.has(entry.name),
  });
  for (const file of files) {
    if (PYTHON_FILE.test(file)) {
      return file;
    }
  }
  return undefined;
}

function hasPythonFile(projectRoot) {
  try {
    return firstPythonFile(projectRoot) !== undefined;
  } catch {
    return false;
  }
}

function listed(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0];
}

export function rejectMissingBuildFiles(config, projectRoot) {
  const markers = PRESET_MARKERS.get(config.preset);
  if (markers === undefined || markerFilesIn(projectRoot, markers.files).length > 0) {
    return;
  }
  const python = markers === PYTHON_MARKERS;
  if (python && hasPythonFile(projectRoot)) {
    return;
  }
  const expected = python ? [...markers.files, '.py file'] : markers.files;
  throw configError(
    `"preset" is "${config.preset}", but ${projectRoot} has no ${listed(expected)}. ` +
      `Run nitpicker from the project's folder, or fix "preset".`,
  );
}
