import { existsSync } from 'node:fs';
import { configError as untypedConfigError } from '../../../shared/config.mjs';
import {
  filesUnder as untypedFilesUnder,
  pathInside as untypedPathInside,
} from '../../../shared/filesystem.mjs';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';

const configError: (message: string) => Error = untypedConfigError;
const pathInside: (root: string, relative: string) => string | undefined = untypedPathInside;
const filesUnder: (
  root: string,
  options: { skipDirectory: (directory: unknown, entry: { name: string }) => boolean },
) => Iterable<string> = untypedFilesUnder;

type Markers = {
  readonly preset: string;
  readonly label: string;
  readonly files: readonly string[];
};

const JVM_MARKERS: Markers = {
  preset: 'java',
  label: 'Gradle or Maven',
  files: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
};
const PYTHON_MARKERS: Markers = {
  preset: 'python',
  label: 'Python',
  files: ['pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile', 'requirements.txt'],
};
const GO_MARKERS: Markers = { preset: 'go', label: 'Go', files: ['go.mod'] };

export const PROJECT_MARKERS: readonly Markers[] = [JVM_MARKERS, PYTHON_MARKERS, GO_MARKERS];

const PRESET_MARKERS = new Map<string, Markers>([
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

export function markerFilesIn(projectRoot: string, files: readonly string[]): string[] {
  return files.filter((file) => existsSync(pathInside(projectRoot, file) ?? ''));
}

function firstPythonFile(projectRoot: string): string | undefined {
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

function hasPythonFile(projectRoot: string): boolean {
  return firstPythonFile(projectRoot) !== undefined;
}

function listed(names: readonly string[]): string {
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} or ${String(names.at(-1))}`
    : String(names[0]);
}

export function rejectMissingBuildFiles(config: NitpickerConfig, projectRoot: string): void {
  const markers = PRESET_MARKERS.get(config.preset ?? '');
  if (markers === undefined || markerFilesIn(projectRoot, markers.files).length > 0) {
    return;
  }
  const python = markers === PYTHON_MARKERS;
  if (python && hasPythonFile(projectRoot)) {
    return;
  }
  const expected = python ? [...markers.files, '.py file'] : markers.files;
  throw configError(
    `"preset" is "${String(config.preset)}", but ${projectRoot} has no ${listed(expected)}. ` +
      `Run nitpicker from the project's folder, or fix "preset".`,
  );
}
