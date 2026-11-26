import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import path from 'node:path';
import { parsedJsonc as untypedParsedJsonc } from '../../../../shared/jsonc/jsonc.mts';
import { fieldOf, isPlainObject, listOf } from '../../../../shared/values/readers.mts';
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

function objectIn(file: string): Record<string, unknown> | undefined {
  const parsed = existsSync(file) ? parsedJsonc(readFileSync(file, 'utf8')) : undefined;
  return parsed?.kind === 'json' && isPlainObject(parsed.value) ? parsed.value : undefined;
}

function stringsIn(value: unknown): string[] {
  const pending: unknown[] = [value];
  for (const current of pending) {
    if (Array.isArray(current)) pending.push(...listOf(current));
    else if (isPlainObject(current)) pending.push(...Object.values(current));
  }
  return pending.filter((entry): entry is string => typeof entry === 'string');
}

function isFolder(file: string): boolean {
  try {
    return statSync(file, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return false;
  }
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

function entriesOf(folder: string): Dirent[] {
  try {
    return readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
}

function hasCode(folder: string, output: ReadonlySet<string>): boolean {
  const pending = [folder];
  for (const current of pending) {
    for (const entry of entriesOf(current)) {
      if (entry.isFile() && isSourceName(entry.name)) return true;
      if (entry.isDirectory() && !entry.name.startsWith('.') && !output.has(entry.name)) {
        pending.push(path.join(current, entry.name));
      }
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
