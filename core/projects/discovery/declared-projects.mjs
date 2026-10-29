import { CONFIG_FILE_NAME, configError } from '../../../shared/config.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { JVM_MARKERS } from './jvm-builds.mjs';
import { PYTHON_MARKERS } from './python-projects.mjs';
import { directoriesWith, isInside, outermost, statInside } from './repository-files.mjs';

const DECLARED_ORIGIN = `${CONFIG_FILE_NAME} "projects"`;
const OWN_MARKERS = ['package.json', ...PYTHON_MARKERS, CONFIG_FILE_NAME];
export const PROJECT_FILES = [...JVM_MARKERS, ...OWN_MARKERS];

export function isGlob(folder) {
  return /[*?{]/u.test(folder);
}

function isFolder(root, folder) {
  return folder === '.' || statInside(root, folder)?.isDirectory() === true;
}

function isBuildModule(directory, { ownDirectories, jvmDirectories }) {
  return (
    !ownDirectories.includes(directory) &&
    jvmDirectories.some((other) => other !== directory && isInside(directory, other))
  );
}

function globMatches(entry, { root, files }) {
  const matcher = globMatcher(entry.path);
  const context = {
    ownDirectories: directoriesWith(root, files, OWN_MARKERS),
    jvmDirectories: directoriesWith(root, files, JVM_MARKERS),
  };
  const matched = directoriesWith(root, files, PROJECT_FILES).filter(
    (directory) =>
      directory !== '.' && matcher.test(directory) && !isBuildModule(directory, context),
  );
  return outermost(matched);
}

function expand(entry, { root, files }) {
  if (!isGlob(entry.path)) {
    if (!isFolder(root, entry.path)) {
      throw configError(`"projects" lists ${entry.path}, which is not a folder under ${root}`);
    }
    return [entry];
  }
  const matches = globMatches(entry, { root, files });
  if (matches.length === 0) {
    throw configError(
      `"projects" entry ${entry.path} matches no folder with a package.json, Python project file, ` +
        `build file or ${CONFIG_FILE_NAME} that is not a module of another Gradle or Maven build`,
    );
  }
  return matches.map((directory) => ({ ...entry, path: directory }));
}

export function resolveDeclaredProjects({ root, entries, files }) {
  const seen = new Set();
  return entries
    .flatMap((entry) => expand(entry, { root, files }))
    .filter((entry) => {
      const fresh = !seen.has(entry.path);
      seen.add(entry.path);
      return fresh;
    })
    .map((entry) => ({ ...entry, origin: DECLARED_ORIGIN }));
}
