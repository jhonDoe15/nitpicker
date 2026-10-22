import { CONFIG_FILE_NAME, configError } from '../../../shared/config.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { JVM_MARKERS } from './jvm-builds.mjs';
import { directoriesWith, statInside } from './repository-files.mjs';

const DECLARED_ORIGIN = `${CONFIG_FILE_NAME} "projects"`;
const PROJECT_FILES = [...JVM_MARKERS, 'package.json', 'pyproject.toml', CONFIG_FILE_NAME];

function isGlob(folder) {
  return /[*?{]/u.test(folder);
}

function isFolder(root, folder) {
  return folder === '.' || statInside(root, folder)?.isDirectory() === true;
}

function expand(entry, { root, files }) {
  if (!isGlob(entry.path)) {
    if (!isFolder(root, entry.path)) {
      throw configError(`"projects" lists ${entry.path}, which is not a folder under ${root}`);
    }
    return [entry];
  }
  const matcher = globMatcher(entry.path);
  const matches = directoriesWith(root, files, PROJECT_FILES).filter(
    (directory) => directory !== '.' && matcher.test(directory),
  );
  if (matches.length === 0) {
    throw configError(
      `"projects" entry ${entry.path} matches no folder with a package.json, ` +
        `pyproject.toml, build file or ${CONFIG_FILE_NAME}`,
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
