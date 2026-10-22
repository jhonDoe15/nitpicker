import path from 'node:path';
import { readJson, trackedText } from './known-files.mjs';
import { holdsSources } from './output-sources.mjs';

const MANIFESTS = new Set([
  'package.json',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
  'pyproject.toml',
]);
const PROJECT_OUTPUT = new Set(['dist', 'build', 'out', 'coverage', 'target']);
const SOURCE_FOLDER_NAMES = new Set(['build', 'out', 'coverage', 'target']);
const ANY_DEPTH_OUTPUT = new Set(['.next', '.nuxt', 'storybook-static', '.turbo', '.parcel-cache']);
const PACKAGE_ENTRY_FIELDS = ['main', 'module', 'types', 'typings', 'bin', 'exports', 'browser'];
const ACTION_FILES = ['action.yml', 'action.yaml'];
const ACTION_ENTRY = /^\s+(?:main|pre|post):\s*["']?([^"'\s#]+)/gmu;

export function buildOutputFolders(projectRoot, files) {
  const tracked = new Set(files);
  const manifests = files.filter((file) => MANIFESTS.has(path.posix.basename(file)));
  const projectDirectories = new Set(manifests.map(directoryOf));
  const filesByFolder = new Map();
  for (const file of files) {
    const folder = outputFolderOf(file, projectDirectories);
    if (folder !== undefined) {
      filesByFolder.set(folder, [...(filesByFolder.get(folder) ?? []), file]);
    }
  }
  const context = { projectRoot, tracked, manifests };
  const flagged = [...filesByFolder].filter(
    ([folder, folderFiles]) =>
      !isShipped(projectRoot, tracked, folder) && !isSourceFolder(folder, folderFiles, context),
  );
  return {
    files: new Set(flagged.flatMap(([, folderFiles]) => folderFiles)),
    folders: flagged.map(([folder]) => ({ folder, anchor: anchorManifest(folder, manifests) })),
  };
}

function isSourceFolder(folder, folderFiles, { projectRoot, tracked, manifests }) {
  if (!SOURCE_FOLDER_NAMES.has(path.posix.basename(folder))) {
    return false;
  }
  const siblings = manifests.filter((manifest) => directoryOf(manifest) === directoryOf(folder));
  return holdsSources(folderFiles) || isReferenced(projectRoot, tracked, { folder, siblings });
}

function isReferenced(projectRoot, tracked, { folder, siblings }) {
  const name = path.posix.basename(folder);
  const reference = new RegExp(`(?:^|[\\s"'=:(./])${name}/([\\w./-]+)`, 'gu');
  return siblings.some((manifest) =>
    [...trackedText(projectRoot, manifest).matchAll(reference)].some((match) =>
      tracked.has(path.posix.normalize(`${folder}/${match[1]}`)),
    ),
  );
}

function anchorManifest(folder, manifests) {
  const byDirectory = new Map(manifests.map((manifest) => [directoryOf(manifest), manifest]));
  const segments = folder.split('/').slice(0, -1);
  const ancestors = segments.map((_, index) =>
    segments.slice(0, segments.length - index).join('/'),
  );
  return [...ancestors, ''].map((directory) => byDirectory.get(directory)).find(Boolean);
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
      [...trackedText(projectRoot, file).matchAll(ACTION_ENTRY)].map((match) => match[1]),
    );
}

function stringsIn(value) {
  const pending = [value];
  const strings = [];
  for (const item of pending) {
    if (typeof item === 'string') {
      strings.push(item);
    } else if (typeof item === 'object' && item !== null) {
      pending.push(...Object.values(item));
    }
  }
  return strings;
}

function directoryOf(file) {
  const directory = path.posix.dirname(file);
  return directory === '.' ? '' : directory;
}
