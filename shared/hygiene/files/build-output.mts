import path from 'node:path';
import { escapeRegExp } from '../../paths/glob.mts';
import { readJson, trackedText } from './known-files.mts';
import { holdsSources } from './output-sources.mts';
import { fieldOf, stringsIn } from '../../values/readers.mts';

type OutputContext = {
  readonly projectRoot: string;
  readonly tracked: ReadonlySet<string>;
  readonly manifests: readonly string[];
};
type OutputFolders = {
  readonly files: Set<string>;
  readonly folders: { readonly folder: string; readonly anchor: string | undefined }[];
};

const BUILD_MANIFESTS = new Set([
  'package.json',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
  'pyproject.toml',
]);
const PROJECT_OUTPUT = new Set(['dist', 'build', 'out', 'coverage', 'target']);

export function isBuildManifest(name: string): boolean {
  return BUILD_MANIFESTS.has(name);
}
const SOURCE_FOLDER_NAMES = new Set(['build', 'out', 'coverage', 'target']);
const ANY_DEPTH_OUTPUT = new Set(['.next', '.nuxt', 'storybook-static', '.turbo', '.parcel-cache']);
const PACKAGE_ENTRY_FIELDS = ['main', 'module', 'types', 'typings', 'bin', 'exports', 'browser'];
const ACTION_FILES = ['action.yml', 'action.yaml'];
const ACTION_ENTRY = /^\s+(?:main|pre|post):\s*["']?([^"'\s#]+)/gmu;

export function buildOutputFolders(projectRoot: string, files: readonly string[]): OutputFolders {
  const tracked = new Set(files);
  const manifests = files.filter((file) => BUILD_MANIFESTS.has(path.posix.basename(file)));
  const projectDirectories = new Set(manifests.map(directoryOf));
  const filesByFolder = new Map<string, string[]>();
  for (const file of files) {
    const folder = outputFolderOf(file, projectDirectories);
    if (folder !== undefined) {
      filesByFolder.set(folder, [...(filesByFolder.get(folder) ?? []), file]);
    }
  }
  const context = { projectRoot, tracked, manifests };
  const flagged = [...filesByFolder].filter(
    ([folder, folderFiles]) =>
      !(isShipped(projectRoot, tracked, folder) || isSourceFolder(folder, folderFiles, context)),
  );
  return {
    files: new Set(flagged.flatMap(([, folderFiles]) => folderFiles)),
    folders: flagged.map(([folder]) => ({ folder, anchor: anchorManifest(folder, manifests) })),
  };
}

function isSourceFolder(
  folder: string,
  folderFiles: readonly string[],
  { projectRoot, tracked, manifests }: OutputContext,
): boolean {
  if (!SOURCE_FOLDER_NAMES.has(path.posix.basename(folder))) {
    return false;
  }
  const siblings = manifests.filter((manifest) => directoryOf(manifest) === directoryOf(folder));
  return holdsSources(folderFiles) || isReferenced(projectRoot, tracked, { folder, siblings });
}

function isReferenced(
  projectRoot: string,
  tracked: ReadonlySet<string>,
  { folder, siblings }: { readonly folder: string; readonly siblings: readonly string[] },
): boolean {
  const name = path.posix.basename(folder);
  const reference = new RegExp(`(?:^|[\\s"'=:(./])${escapeRegExp(name)}/([\\w./-]+)`, 'gu');
  return siblings.some((manifest) =>
    [...trackedText(projectRoot, manifest).matchAll(reference)].some((match) =>
      tracked.has(path.posix.normalize(`${folder}/${match[1] ?? ''}`)),
    ),
  );
}

function anchorManifest(folder: string, manifests: readonly string[]): string | undefined {
  const byDirectory = new Map(
    manifests.map((manifest): [string, string] => [directoryOf(manifest), manifest]),
  );
  const segments = folder.split('/').slice(0, -1);
  const ancestors = segments.map((_, index) =>
    segments.slice(0, segments.length - index).join('/'),
  );
  return [...ancestors, ''].map((directory) => byDirectory.get(directory)).find(Boolean);
}

function outputFolderOf(file: string, projectDirectories: ReadonlySet<string>): string | undefined {
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

function isShipped(projectRoot: string, tracked: ReadonlySet<string>, folder: string): boolean {
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

function packageEntries(
  projectRoot: string,
  tracked: ReadonlySet<string>,
  parent: string,
): string[] {
  const manifest = path.posix.join(parent, 'package.json');
  const value = tracked.has(manifest)
    ? readJson(path.join(projectRoot, manifest)).value
    : undefined;
  if (
    value === undefined ||
    fieldOf(value, 'private') === true ||
    fieldOf(fieldOf(value, 'scripts'), 'prepare') !== undefined
  ) {
    return [];
  }
  return PACKAGE_ENTRY_FIELDS.flatMap((field) => stringsIn(fieldOf(value, field)));
}

function actionEntries(
  projectRoot: string,
  tracked: ReadonlySet<string>,
  parent: string,
): string[] {
  return ACTION_FILES.map((name) => path.posix.join(parent, name))
    .filter((file) => tracked.has(file))
    .flatMap((file) =>
      [...trackedText(projectRoot, file).matchAll(ACTION_ENTRY)].map((match) => match[1] ?? ''),
    );
}

function directoryOf(file: string): string {
  const directory = path.posix.dirname(file);
  return directory === '.' ? '' : directory;
}
