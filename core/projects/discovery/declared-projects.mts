import { CONFIG_FILE_NAME, configError as untypedConfigError } from '../../../shared/config.mjs';
import { globMatcher as untypedGlobMatcher } from '../../../shared/paths/glob.mjs';
import { textOf } from '../../../shared/values/readers.mts';
import type { DeclaredEntry } from '../../configuration/layers/settings.mts';
import type { ProjectEntry } from '../project-types.mts';
import { JVM_MARKERS, isBuildModule } from './jvm-builds.mts';
import { PYTHON_MARKERS } from './python-projects.mts';
import { directoriesWith, isInside, outermost, statInside } from './repository-files.mts';
import { detectProjects } from './detect.mts';

type Matcher = { test(path: string): boolean };
const globMatcher: (glob: string) => Matcher = untypedGlobMatcher;
const configError: (message: string) => Error = untypedConfigError;

export const DECLARED_ORIGIN = `${CONFIG_FILE_NAME} "projects"`;
const DECLARING_FILES = new Map<string, string>([
  ['pnpm-workspace.yaml', 'pnpm-workspace.yaml'],
  ['package.json workspaces', 'package.json'],
  ['uv workspace', 'pyproject.toml'],
]);
const OWN_MARKERS = ['package.json', 'project.json', ...PYTHON_MARKERS, CONFIG_FILE_NAME];
export const PROJECT_FILES = [...JVM_MARKERS, ...OWN_MARKERS];

type Files = { readonly root: string; readonly files: readonly string[] };

function isGlob(folder: string): boolean {
  return /[*?{]/u.test(folder);
}

function isFolder(root: string, folder: string): boolean {
  return folder === '.' || statInside(root, folder)?.isDirectory() === true;
}

function globMatches(entry: DeclaredEntry, { root, files }: Files): string[] {
  const matcher = globMatcher(entry.path);
  const ownDirectories = directoriesWith(root, files, OWN_MARKERS);
  const jvmDirectories = directoriesWith(root, files, JVM_MARKERS);
  const matched = directoriesWith(root, files, PROJECT_FILES).filter(
    (directory) =>
      directory !== '.' &&
      matcher.test(directory) &&
      (ownDirectories.includes(directory) || !isBuildModule(root, directory, jvmDirectories)),
  );
  return outermost(matched).toSorted((left, right) =>
    left.localeCompare(right, 'en', { numeric: true }),
  );
}

function rejectSubmodules(entry: DeclaredEntry, submodules: readonly string[]): void {
  const matcher = isGlob(entry.path) ? globMatcher(entry.path) : undefined;
  const named = submodules.find((submodule) =>
    matcher === undefined ? isInside(entry.path, submodule) : matcher.test(submodule),
  );
  if (named !== undefined) {
    throw configError(
      `"projects" entry ${entry.path} names ${named}, a Git submodule. Nitpicker does not gate a ` +
        `submodule from the repository around it: leave it out of "projects" and run nitpicker inside ${named}`,
    );
  }
}

function expand(
  entry: DeclaredEntry,
  { root, files, submodules = [] }: Files & { readonly submodules?: readonly string[] | undefined },
): DeclaredEntry[] {
  rejectSubmodules(entry, submodules);
  if (!isGlob(entry.path)) {
    if (!isFolder(root, entry.path)) {
      throw configError(`"projects" lists ${entry.path}, which is not a folder under ${root}`);
    }
    return [entry];
  }
  const matches = globMatches(entry, { root, files });
  if (matches.length === 0) {
    throw configError(
      `"projects" entry ${entry.path} matches no folder with a package.json, Nx project.json, Python project file, ` +
        `build file or ${CONFIG_FILE_NAME} that is not a module of another Gradle or Maven build`,
    );
  }
  return matches.map((directory) => ({ ...entry, path: directory }));
}

function filesUnder(files: readonly string[], folder: string): string[] {
  return files
    .filter((file) => file.startsWith(`${folder}/`))
    .map((file) => file.slice(folder.length + 1));
}

function workspaceMembersOf(entry: DeclaredEntry, { root, files }: Files): ProjectEntry[] {
  const listed = { ...entry, origin: DECLARED_ORIGIN };
  if (entry.path === '.' || entry.expand === false) {
    return [listed];
  }
  const nested = detectProjects({
    root: `${root}/${entry.path}`,
    files: filesUnder(files, entry.path),
  });
  if (!nested.multiple) {
    return [listed];
  }
  const declaring = nested.entries.map(({ origin }) => DECLARING_FILES.get(origin)).find(Boolean);
  return nested.entries.map((member) => ({
    ...entry,
    path: member.path === '.' ? entry.path : `${entry.path}/${member.path}`,
    origin: `${entry.path}/${textOf(declaring)}`,
    workspace: entry.path,
  }));
}

function isRepeat(entry: ProjectEntry, kept: readonly ProjectEntry[]): boolean {
  return kept.some(
    (other) =>
      other.path === entry.path &&
      (other.preset === undefined || entry.preset === undefined || other.preset === entry.preset),
  );
}

function withIdentities(entries: readonly ProjectEntry[]): ProjectEntry[] {
  return entries.map((entry) => {
    const sharers = entries.filter((other) => other.path === entry.path);
    if (sharers.length === 1) {
      return entry;
    }
    const later = sharers[0] === entry ? {} : { later: true as const };
    return {
      ...entry,
      path: `${entry.path}@${textOf(entry.preset)}`,
      folder: entry.path,
      ...later,
    };
  });
}

export function resolveDeclaredProjects({
  root,
  entries,
  files,
  submodules,
}: Files & {
  readonly entries: readonly DeclaredEntry[];
  readonly submodules?: readonly string[] | undefined;
}): ProjectEntry[] {
  const kept: ProjectEntry[] = [];
  for (const entry of entries
    .flatMap((listed) => expand(listed, { root, files, submodules }))
    .flatMap((listed) => workspaceMembersOf(listed, { root, files }))) {
    if (!isRepeat(entry, kept)) {
      kept.push(entry);
    }
  }
  return withIdentities(kept);
}
