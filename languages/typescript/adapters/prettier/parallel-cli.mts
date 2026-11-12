import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { trackTemporaryPath, untrackTemporaryPath } from '../typed/tooling.mts';

const EXCLUSION_FILE_NAME = '.nitpicker-diff-prettier-exclude';
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const PRETTIER_RUN_CEILING_MS = 60 * 60 * 1000;
const LITERAL_SEGMENT = /^[\w.-]+$/u;
const GLOB_CHARACTERS = /[*?[\]{}()!+@|\\]/u;

export type ParallelPrettierRun = {
  readonly toolPath: string;
  readonly projectRoot: string;
  readonly configPath: string;
  readonly ignorePath: string;
  readonly patterns: readonly string[];
  readonly exclusions: readonly string[];
};

type ExclusionScope = { readonly projectRoot: string; readonly patterns: readonly string[] };

type ExclusionFile = { readonly path?: string | undefined; readonly failure?: unknown };

export function listUnformattedInParallel({
  toolPath,
  projectRoot,
  configPath,
  ignorePath,
  patterns,
  exclusions,
}: ParallelPrettierRun): string[] | undefined {
  const exclusionLines = exclusionIgnoreLines(exclusions, { projectRoot, patterns });
  if (exclusionLines === undefined) {
    return undefined;
  }
  const exclusionFile = writeExclusionFile(projectRoot, exclusionLines);
  if (exclusionFile.failure !== undefined) {
    return undefined;
  }
  const exclusionPath = exclusionFile.path;
  try {
    const result = spawnSync(
      process.execPath,
      [
        toolPath,
        '--experimental-cli',
        '--no-cache',
        '--no-color',
        '--config-path',
        configPath,
        '--ignore-path',
        ignorePath,
        ...(exclusionPath === undefined ? [] : ['--ignore-path', exclusionPath]),
        '--no-editorconfig',
        '--list-different',
        '--no-error-on-unmatched-pattern',
        ...patterns,
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: PRETTIER_RUN_CEILING_MS,
      },
    );
    return unformattedFilesOf(result);
  } finally {
    removeExclusionFile(exclusionPath);
  }
}

export function exclusionIgnoreLines(
  exclusions: readonly string[],
  { projectRoot, patterns }: ExclusionScope,
): string[] | undefined {
  const staticBases = patterns.map(staticBase);
  return exclusions.every((glob) => isTranslatableExclusion(glob, { projectRoot, staticBases }))
    ? exclusions.map((glob) => `/${glob}`)
    : undefined;
}

function isTranslatableExclusion(
  glob: string,
  {
    projectRoot,
    staticBases,
  }: { readonly projectRoot: string; readonly staticBases: readonly string[][] },
): boolean {
  const segments = glob.split('/');
  const folderSegments = segments.at(-1) === '**' ? segments.slice(0, -1) : segments;
  return (
    folderSegments.length > 0 &&
    folderSegments.every((segment) => LITERAL_SEGMENT.test(segment) && !/^\.+$/u.test(segment)) &&
    !staticBases.some((base) => isAncestorOrSelf(folderSegments, base)) &&
    !hasCaseVariant(projectRoot, folderSegments)
  );
}

function staticBase(pattern: string): string[] {
  const segments = pattern.split('/');
  const firstGlob = segments.findIndex((segment) => GLOB_CHARACTERS.test(segment));
  return firstGlob === -1 ? segments.slice(0, -1) : segments.slice(0, firstGlob);
}

function isAncestorOrSelf(segments: readonly string[], base: readonly string[]): boolean {
  return (
    segments.length <= base.length && segments.every((segment, index) => segment === base[index])
  );
}

function hasCaseVariant(projectRoot: string, segments: readonly string[]): boolean {
  for (const [index, segment] of segments.entries()) {
    const entryPath = path.resolve(projectRoot, ...segments.slice(0, index + 1));
    if (!entryPath.startsWith(projectRoot + path.sep)) {
      return true;
    }
    const entries = readdirSync(path.dirname(entryPath), { withFileTypes: true });
    if (
      entries.some(({ name }) => name !== segment && name.toLowerCase() === segment.toLowerCase())
    ) {
      return true;
    }
    const entry = entries.find(({ name }) => name === segment);
    if (entry === undefined || !entry.isDirectory()) {
      return false;
    }
  }
  return false;
}

function unformattedFilesOf(result: SpawnSyncReturns<string>): string[] | undefined {
  if (result.error !== undefined || result.stderr.trim().length > 0) {
    return undefined;
  }
  const files = result.stdout
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (result.status === 0 && files.length === 0) {
    return [];
  }
  return result.status === 1 && files.length > 0 ? files : undefined;
}

function writeExclusionFile(projectRoot: string, exclusionLines: readonly string[]): ExclusionFile {
  if (exclusionLines.length === 0) {
    return { path: undefined };
  }
  const exclusionPath = trackTemporaryPath(path.join(projectRoot, EXCLUSION_FILE_NAME));
  try {
    writeFileSync(exclusionPath, `${exclusionLines.join('\n')}\n`, { flag: 'wx' });
    return { path: exclusionPath };
  } catch (error) {
    untrackTemporaryPath(exclusionPath);
    return { failure: error };
  }
}

function removeExclusionFile(exclusionPath: string | undefined): void {
  if (exclusionPath === undefined) {
    return;
  }
  untrackTemporaryPath(exclusionPath);
  rmSync(exclusionPath, { force: true });
}
