import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parsedTsconfig } from '../../../preset/modules/tsconfig-files.mjs';
import { compareText } from '../../../../../shared/paths/path-order.mjs';
import { projectFilesUnder } from '../../../../../shared/project-files/project-files.mjs';

const OUTPUT_FOLDERS = new Set([
  'dist',
  'build',
  'lib',
  'out',
  'esm',
  'cjs',
  'es',
  'umd',
  'module',
  'commonjs',
  'types',
  'typings',
]);
const ENTRY_FIELDS = ['main', 'module', 'types', 'typings', 'bin', 'exports'];
const OUTPUT_FILE = /\.(?:d\.)?[cm]?[jt]sx?$/u;
const SOURCE_EXTENSIONS = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const SKIPPED_FOLDERS = new Set(['node_modules', '.git']);

function pathsIn(value) {
  const found = [];
  const pending = [value];
  for (const item of pending) {
    if (typeof item === 'string') {
      found.push(item);
    } else if (Array.isArray(item)) {
      pending.push(...item);
    } else if (typeof item === 'object' && item !== null) {
      pending.push(...Object.values(item));
    }
  }
  return found;
}

function readManifest(directory) {
  const file = path.join(directory, 'package.json');
  if (!existsSync(file)) {
    return {};
  }
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    return typeof manifest === 'object' && manifest !== null ? manifest : {};
  } catch {
    return {};
  }
}

function withoutOutputFolders(segments) {
  const first = segments.findIndex((segment) => !OUTPUT_FOLDERS.has(segment));
  return first === -1 ? [] : segments.slice(first);
}

const BUILD_CONFIGS = ['tsconfig.json', 'tsconfig.build.json'];

function relativeFolder(projectRoot, folder) {
  const relative = path.relative(projectRoot, folder).split(path.sep).join('/');
  return relative.startsWith('..') ? undefined : relative;
}

function mappingsOf(projectRoot, file) {
  const { options } = parsedTsconfig(file);
  const source =
    options.rootDir === undefined ? undefined : relativeFolder(projectRoot, options.rootDir);
  return [options.outDir, options.declarationDir]
    .filter((folder) => folder !== undefined && source !== undefined)
    .map((folder) => ({ output: relativeFolder(projectRoot, folder), source }))
    .filter(({ output }) => output !== undefined && output !== '');
}

function configuredMappings(projectRoot) {
  return BUILD_CONFIGS.map((name) => path.join(projectRoot, name))
    .filter((file) => existsSync(file))
    .flatMap((file) => mappingsOf(projectRoot, file));
}

function mappedByConfig(entry, mappings) {
  const normalized = path.posix.normalize(entry);
  const mapping = mappings.find(({ output }) => normalized.startsWith(`${output}/`));
  if (mapping === undefined || !OUTPUT_FILE.test(normalized)) {
    return undefined;
  }
  const stem = normalized.slice(mapping.output.length + 1).replace(OUTPUT_FILE, '');
  return [`${mapping.source === '' ? '' : `${mapping.source}/`}${stem}.${SOURCE_EXTENSIONS}`];
}

function sourcePattern(entry, { sourceRoots, mappings }) {
  const configured = mappedByConfig(entry, mappings);
  if (configured !== undefined) {
    return configured;
  }
  const segments = path.posix.normalize(entry).split('/').filter(Boolean);
  if (segments[0] === '..' || !OUTPUT_FILE.test(entry) || OUTPUT_FOLDERS.has(segments.at(-1))) {
    return [];
  }
  const rest = withoutOutputFolders(segments);
  if (rest.length === 0 || rest.length === segments.length) {
    return [];
  }
  const stem = rest.join('/').replace(OUTPUT_FILE, '');
  return sourceRoots.map((root) => `${root}/${stem}.${SOURCE_EXTENSIONS}`);
}

export function publishedSourceEntries(projectRoot, sourceRoots) {
  const manifest = readManifest(projectRoot);
  const mappings = configuredMappings(projectRoot);
  const entries = ENTRY_FIELDS.flatMap((field) => pathsIn(manifest[field]));
  const patterns = entries.flatMap((entry) => sourcePattern(entry, { sourceRoots, mappings }));
  return [...new Set(patterns)].toSorted(compareText);
}

function overlapsRoot(folder, roots) {
  return roots.some((root) => {
    const normalized = path.posix.normalize(root);
    return (
      normalized === '.' ||
      folder === normalized ||
      folder.startsWith(`${normalized}/`) ||
      normalized.startsWith(`${folder}/`)
    );
  });
}

function existsInside(base, name) {
  const full = path.resolve(base, name);
  if (!full.startsWith(`${base}${path.sep}`)) {
    return false;
  }
  return existsSync(full);
}

function holdsRoot(projectRoot, folder, roots) {
  const base = path.join(projectRoot, folder);
  return roots.some((root) => existsInside(base, root));
}

export function nestedPackageFolders(projectRoot, roots, configured = []) {
  const root = path.resolve(projectRoot);
  const folders = projectFilesUnder(root, {
    includeIgnored: false,
    skipDirectory: (_absolute, entry) => SKIPPED_FOLDERS.has(entry.name),
  })
    .filter((file) => path.basename(file) === 'package.json')
    .map((file) => path.relative(root, path.dirname(file)).split(path.sep).join('/'))
    .filter(
      (folder) =>
        folder !== '' &&
        !overlapsRoot(folder, roots) &&
        !configured.includes(folder) &&
        !holdsRoot(root, folder, roots),
    );
  return [...new Set(folders)].toSorted(compareText);
}

export function withPackageEntries(config, projectRoot, layout) {
  const nested = nestedPackageFolders(
    projectRoot,
    [...layout.sourceRoots, ...layout.testRoots],
    Object.keys(config.workspaces ?? {}),
  );
  return {
    ...config,
    entry: [...config.entry, ...publishedSourceEntries(projectRoot, layout.sourceRoots)],
    ...(nested.length === 0
      ? {}
      : { ignoreWorkspaces: [...(config.ignoreWorkspaces ?? []), ...nested] }),
  };
}
