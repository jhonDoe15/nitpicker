import { readdirSync, readFileSync, statSync, type Dirent, type Stats } from 'node:fs';
import path from 'node:path';
import { parsedJsonc as untypedParsedJsonc } from '../../../../shared/jsonc/jsonc.mts';
import { fieldOf, isPlainObject, stringsIn } from '../../../../shared/values/readers.mts';
import { expandBraces } from '../../../../languages/typescript/preset/layout/source-root/root-paths.mts';

type ParsedJsonc = { readonly kind: string; readonly value?: unknown };

const parsedJsonc: (text: string) => ParsedJsonc = untypedParsedJsonc;

const PACKAGE_ROOT = '.';
const DEFAULT_SOURCE_FOLDER = 'src';
const BUILD_FOLDERS = ['dist', 'build', 'out', 'target', 'coverage', 'node_modules'];
const TEST_FOLDERS = ['test', 'tests', '__tests__', 'e2e'];
const ENTRY_FIELDS = ['main', 'module', 'exports', 'bin'];
const OUTPUT_OPTIONS = ['outDir', 'declarationDir'];
const GLOB_SYNTAX = /[*?{}[\]]/u;
const FILE_NAME = /.\.[^./]+$/u;
const CODE_FILE = /\.[cm]?[jt]sx?$/u;
const EXTENSION = /\.[^./]+$/u;
const TOOL_CONFIG = /\.config\.[cm]?[jt]s$/u;
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;

type StatResult = { readonly stats?: Stats | undefined; readonly error?: unknown };

function statOf(file: string): StatResult {
  try {
    return { stats: statSync(file, { throwIfNoEntry: false }) };
  } catch (error) {
    return { error };
  }
}

function objectIn(file: string): Record<string, unknown> | undefined {
  const parsed = statOf(file).stats?.isFile() ? parsedJsonc(readFileSync(file, 'utf8')) : undefined;
  return parsed?.kind === 'json' && isPlainObject(parsed.value) ? parsed.value : undefined;
}

function isFolder(file: string): boolean {
  return statOf(file).stats?.isDirectory() ?? false;
}

function topFolderOf(target: string): string | undefined {
  const relative = path.posix.normalize(target.replaceAll('\\', '/'));
  if (relative.startsWith('../') || relative === '..' || path.posix.isAbsolute(relative)) {
    return undefined;
  }
  const [first = PACKAGE_ROOT] = relative.split('/');
  const fileAtRoot = !relative.includes('/') && FILE_NAME.test(first);
  return fileAtRoot || GLOB_SYNTAX.test(first) ? PACKAGE_ROOT : first;
}

function rootsOf(
  targets: readonly string[],
  absolute: string,
  output: ReadonlySet<string>,
): string[] {
  const folders = targets
    .flatMap(expandBraces)
    .map(topFolderOf)
    .filter((folder): folder is string => folder !== undefined && !output.has(folder))
    .filter((folder) => !TEST_FOLDERS.includes(folder))
    .filter((folder) => folder === PACKAGE_ROOT || isFolder(path.join(absolute, folder)));
  return folders.includes(PACKAGE_ROOT) ? [PACKAGE_ROOT] : [...new Set(folders)].sort();
}

function outputFoldersOf(tsconfig: Record<string, unknown> | undefined): Set<string> {
  const options = fieldOf(tsconfig, 'compilerOptions');
  const declared = OUTPUT_OPTIONS.flatMap((option) => stringsIn(fieldOf(options, option)));
  const named = declared
    .map(topFolderOf)
    .filter((folder): folder is string => folder !== undefined && folder !== PACKAGE_ROOT);
  return new Set([...BUILD_FOLDERS, ...named]);
}

function isSourceName(name: string): boolean {
  return CODE_FILE.test(name) && !DECLARATION_FILE.test(name) && !TOOL_CONFIG.test(name);
}

type EntriesResult = { readonly entries: Dirent[]; readonly error?: unknown };

function entriesOf(folder: string): EntriesResult {
  try {
    return { entries: readdirSync(folder, { withFileTypes: true }) };
  } catch (error) {
    return { entries: [], error };
  }
}

function scanFolder(
  folder: string,
  output: ReadonlySet<string>,
): { readonly found: boolean; readonly subfolders: string[] } {
  const { entries } = entriesOf(folder);
  return {
    found: entries.some((entry) => entry.isFile() && isSourceName(entry.name)),
    subfolders: entries
      .filter(
        (entry) => entry.isDirectory() && !entry.name.startsWith('.') && !output.has(entry.name),
      )
      .map((entry) => path.join(folder, entry.name)),
  };
}

function hasCode(folder: string, output: ReadonlySet<string>): boolean {
  const pending = [folder];
  for (const current of pending) {
    const scan = scanFolder(current, output);
    if (scan.found) {
      return true;
    }
    for (const subfolder of scan.subfolders) {
      pending.push(subfolder);
    }
  }
  return false;
}

function rootsWithCode(
  absolute: string,
  tsconfig: Record<string, unknown> | undefined,
): string[] | undefined {
  const output = outputFoldersOf(tsconfig);
  const roots = derivedFrom(absolute, tsconfig, output);
  return roots.some((root) => hasCode(path.join(absolute, root), output)) ? roots : undefined;
}

export function derivedSourceRoots(absolute: string): string[] | undefined {
  if (isFolder(path.join(absolute, DEFAULT_SOURCE_FOLDER))) {
    return undefined;
  }
  const tsconfig = objectIn(path.join(absolute, 'tsconfig.json'));
  return rootsWithCode(absolute, tsconfig);
}

function derivedFrom(
  absolute: string,
  tsconfig: Record<string, unknown> | undefined,
  output: ReadonlySet<string>,
): string[] {
  const fromTsconfig = rootsOf(
    [...stringsIn(fieldOf(tsconfig, 'include')), ...stringsIn(fieldOf(tsconfig, 'files'))],
    absolute,
    output,
  );
  if (fromTsconfig.length > 0) {
    return fromTsconfig;
  }
  const manifest = objectIn(path.join(absolute, 'package.json'));
  const fromManifest = rootsOf(
    ENTRY_FIELDS.flatMap((field) => stringsIn(fieldOf(manifest, field))).filter(
      (target) => CODE_FILE.test(target) || !EXTENSION.test(path.posix.basename(target)),
    ),
    absolute,
    output,
  );
  return fromManifest.length > 0 ? fromManifest : [PACKAGE_ROOT];
}
