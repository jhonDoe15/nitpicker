import { CONFIG_FILE_NAME, configError } from '../../../shared/config.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { JVM_MARKERS, isBuildModule } from './jvm-builds.mjs';
import { PYTHON_MARKERS } from './python-projects.mjs';
import { directoriesWith, isInside, outermost, statInside } from './repository-files.mjs';
import { detectProjects } from './detect.mjs';

export const DECLARED_ORIGIN = `${CONFIG_FILE_NAME} "projects"`;
const DECLARING_FILES = new Map([
  ['pnpm-workspace.yaml', 'pnpm-workspace.yaml'],
  ['package.json workspaces', 'package.json'],
  ['uv workspace', 'pyproject.toml'],
]);
const OWN_MARKERS = ['package.json', 'project.json', ...PYTHON_MARKERS, CONFIG_FILE_NAME];
export const PROJECT_FILES = [...JVM_MARKERS, ...OWN_MARKERS];

function isGlob(folder) {
  return /[*?{]/u.test(folder);
}

function isFolder(root, folder) {
  return folder === '.' || statInside(root, folder)?.isDirectory() === true;
}

function globMatches(entry, { root, files }) {
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

function rejectSubmodules(entry, submodules) {
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

function expand(entry, { root, files, submodules = [] }) {
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

function filesUnder(files, folder) {
  return files
    .filter((file) => file.startsWith(`${folder}/`))
    .map((file) => file.slice(folder.length + 1));
}

function workspaceMembersOf(entry, { root, files }) {
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
    ...(entry.preset === undefined ? {} : { preset: entry.preset }),
    path: member.path === '.' ? entry.path : `${entry.path}/${member.path}`,
    origin: `${entry.path}/${declaring}`,
    workspace: entry.path,
  }));
}

export function resolveDeclaredProjects({ root, entries, files, submodules }) {
  const seen = new Set();
  return entries
    .flatMap((entry) => expand(entry, { root, files, submodules }))
    .flatMap((entry) => workspaceMembersOf(entry, { root, files }))
    .filter((entry) => {
      const fresh = !seen.has(entry.path);
      seen.add(entry.path);
      return fresh;
    });
}
