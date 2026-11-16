import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, fieldsOf, listOf, stringsIn } from '../../../../../shared/values/readers.mts';
import type { Layout } from '../../typed/head-policy.mts';
import type { KnipConfig } from '../typed/policy.mts';
import {
  compareText,
  hasProjectFile,
  parsedTsconfig,
  projectFilesUnder,
} from './typed/entry-views.mts';

type Mapping = { readonly output: string; readonly source: string };

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

function readManifest(directory: string): unknown {
  const file = path.join(directory, 'package.json');
  if (!existsSync(file)) {
    return {};
  }
  try {
    const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return typeof manifest === 'object' && manifest !== null ? manifest : {};
  } catch {
    return {};
  }
}

function withoutOutputFolders(segments: string[]): string[] {
  const first = segments.findIndex((segment) => !OUTPUT_FOLDERS.has(segment));
  return first === -1 ? [] : segments.slice(first);
}

const BUILD_CONFIGS = ['tsconfig.json', 'tsconfig.build.json'];

function relativeFolder(projectRoot: string, folder: string): string | undefined {
  const relative = path.relative(projectRoot, folder).split(path.sep).join('/');
  return relative.startsWith('..') ? undefined : relative;
}

function mappingsOf(projectRoot: string, file: string): Mapping[] {
  const { options } = parsedTsconfig(file);
  const source =
    options.rootDir === undefined ? undefined : relativeFolder(projectRoot, options.rootDir);
  return [options.outDir, options.declarationDir].flatMap((folder) => {
    if (folder === undefined || source === undefined) {
      return [];
    }
    const output = relativeFolder(projectRoot, folder);
    return output === undefined || output === '' ? [] : [{ output, source }];
  });
}

function configuredMappings(projectRoot: string): Mapping[] {
  return BUILD_CONFIGS.map((name) => path.join(projectRoot, name))
    .filter((file) => existsSync(file))
    .flatMap((file) => mappingsOf(projectRoot, file));
}

function mappedByConfig(entry: string, mappings: readonly Mapping[]): string[] | undefined {
  const normalized = path.posix.normalize(entry);
  const mapping = mappings.find(({ output }) => normalized.startsWith(`${output}/`));
  if (mapping === undefined || !OUTPUT_FILE.test(normalized)) {
    return undefined;
  }
  const stem = normalized.slice(mapping.output.length + 1).replace(OUTPUT_FILE, '');
  return [`${mapping.source === '' ? '' : `${mapping.source}/`}${stem}.${SOURCE_EXTENSIONS}`];
}

function sourcePattern(
  entry: string,
  { sourceRoots, mappings }: { sourceRoots: readonly string[]; mappings: readonly Mapping[] },
): string[] {
  const configured = mappedByConfig(entry, mappings);
  if (configured !== undefined) {
    return configured;
  }
  const segments = path.posix.normalize(entry).split('/').filter(Boolean);
  if (
    segments[0] === '..' ||
    !OUTPUT_FILE.test(entry) ||
    OUTPUT_FOLDERS.has(segments.at(-1) ?? '')
  ) {
    return [];
  }
  const rest = withoutOutputFolders(segments);
  if (rest.length === 0 || rest.length === segments.length) {
    return [];
  }
  const stem = rest.join('/').replace(OUTPUT_FILE, '');
  return sourceRoots.map((root) => `${root}/${stem}.${SOURCE_EXTENSIONS}`);
}

export function publishedSourceEntries(
  projectRoot: string,
  sourceRoots: readonly string[],
): string[] {
  const manifest = readManifest(projectRoot);
  const mappings = configuredMappings(projectRoot);
  const entries = ENTRY_FIELDS.flatMap((field) => stringsIn(fieldOf(manifest, field)));
  const patterns = entries.flatMap((entry) => sourcePattern(entry, { sourceRoots, mappings }));
  return [...new Set(patterns)].toSorted(compareText);
}

function overlapsRoot(folder: string, roots: readonly string[]): boolean {
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

function holdsRoot(projectRoot: string, folder: string, roots: readonly string[]): boolean {
  const base = path.join(projectRoot, folder);
  return roots.some((root) => hasProjectFile(base, root));
}

export function nestedPackageFolders(
  projectRoot: string,
  roots: readonly string[],
  configured: readonly string[] = [],
): string[] {
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

export function withPackageEntries(
  config: KnipConfig,
  projectRoot: string,
  layout: Layout,
): KnipConfig {
  const nested = nestedPackageFolders(
    projectRoot,
    [...layout.sourceRoots, ...layout.testRoots],
    Object.keys(fieldsOf(config['workspaces'])),
  );
  return {
    ...config,
    entry: [...listOf(config['entry']), ...publishedSourceEntries(projectRoot, layout.sourceRoots)],
    ...(nested.length === 0
      ? {}
      : { ignoreWorkspaces: [...listOf(config['ignoreWorkspaces']), ...nested] }),
  };
}
