import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readJson } from './known-files.mjs';

const MANIFESTS = new Set([
  'package.json',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
  'pyproject.toml',
]);
const PROJECT_OUTPUT = new Set(['dist', 'build', 'out', 'coverage', 'target']);
const ANY_DEPTH_OUTPUT = new Set(['.next', '.nuxt', 'storybook-static', '.turbo', '.parcel-cache']);
const PACKAGE_ENTRY_FIELDS = ['main', 'module', 'types', 'typings', 'bin', 'exports', 'browser'];
const ACTION_FILES = ['action.yml', 'action.yaml'];
const ACTION_ENTRY = /^\s+(?:main|pre|post):\s*["']?([^"'\s#]+)/gmu;

export function buildOutputFolders(projectRoot, files) {
  const tracked = new Set(files);
  const projectDirectories = new Set(
    files.filter((file) => MANIFESTS.has(path.posix.basename(file))).map(directoryOf),
  );
  const folders = new Map();
  for (const file of files) {
    const folder = outputFolderOf(file, projectDirectories);
    if (folder !== undefined) folders.set(file, folder);
  }
  const shipped = new Set(
    [...new Set(folders.values())].filter((folder) => isShipped(projectRoot, tracked, folder)),
  );
  return new Map([...folders].filter(([, folder]) => !shipped.has(folder)));
}

function outputFolderOf(file, projectDirectories) {
  const segments = file.split('/');
  const index = segments
    .slice(0, -1)
    .findIndex(
      (segment, position) =>
        ANY_DEPTH_OUTPUT.has(segment) ||
        (PROJECT_OUTPUT.has(segment) &&
          projectDirectories.has(segments.slice(0, position).join('/'))),
    );
  return index === -1 ? undefined : segments.slice(0, index + 1).join('/');
}

function isShipped(projectRoot, tracked, folder) {
  const parent = directoryOf(folder);
  const entries = [
    ...packageEntries(projectRoot, tracked, parent),
    ...actionEntries(projectRoot, tracked, parent),
  ];
  return entries.some((entry) => {
    const location = path.posix.normalize(path.posix.join(parent, entry));
    return location.startsWith(`${folder}/`);
  });
}

function packageEntries(projectRoot, tracked, parent) {
  const manifest = path.posix.join(parent, 'package.json');
  const value = tracked.has(manifest)
    ? readJson(path.join(projectRoot, manifest)).value
    : undefined;
  if (value === undefined || value.private === true || value.scripts?.prepare !== undefined) {
    return [];
  }
  return PACKAGE_ENTRY_FIELDS.flatMap((field) => stringsIn(value[field]));
}

function actionEntries(projectRoot, tracked, parent) {
  return ACTION_FILES.map((name) => path.posix.join(parent, name))
    .filter((file) => tracked.has(file))
    .flatMap((file) =>
      [...readFileSync(path.join(projectRoot, file), 'utf8').matchAll(ACTION_ENTRY)].map(
        (match) => match[1],
      ),
    );
}

function stringsIn(value) {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap((entry) => stringsIn(entry));
}

function directoryOf(file) {
  const directory = path.posix.dirname(file);
  return directory === '.' ? '' : directory;
}
