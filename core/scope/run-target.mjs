import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveProjectRoot } from '../tooling/tool-resolution.mjs';
import { runGit } from '../diff/git/repository/command.mjs';
import { normalizeGitPath } from '../diff/git/normalize.mjs';

export function resolveRunTarget({ options, currentProjectRoot, workingDirectory }) {
  const paths = options.paths ?? [];
  if (paths.length === 0) {
    return {
      currentProjectRoot:
        currentProjectRoot === undefined ? resolveProjectRoot() : realpathSync(currentProjectRoot),
    };
  }
  const targets = paths.map((given) => ({
    given,
    absolute: existingPath(workingDirectory ?? process.cwd(), given),
  }));
  const projectRoot = projectOf(targets[0].absolute);
  const relativePaths = targets.map((target) => scopePath(projectRoot, target));
  return {
    currentProjectRoot: projectRoot,
    scope: relativePaths.includes('.') ? undefined : { paths: [...new Set(relativePaths)].sort() },
  };
}

function existingPath(workingDirectory, given) {
  const absolute = path.resolve(workingDirectory, given);
  if (!existsSync(absolute)) {
    throw new Error(`${given} matches no file`);
  }
  return realpathSync(absolute);
}

function projectOf(absolute) {
  return resolveProjectRoot(statSync(absolute).isDirectory() ? absolute : path.dirname(absolute));
}

function scopePath(projectRoot, { given, absolute }) {
  const relative = path.relative(projectRoot, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${given} is outside the project ${projectRoot}; give paths in one project`);
  }
  const ownProject = projectOf(absolute);
  if (ownProject !== projectRoot) {
    throw new Error(
      `${given} is in the project ${ownProject}, not in ${projectRoot}; give paths in one project`,
    );
  }
  const scoped = normalizeGitPath(relative || '.');
  if (!hasCheckedFile(projectRoot, scoped)) {
    throw new Error(`${given} matches no file that nitpicker checks (none tracked or untracked)`);
  }
  return scoped;
}

function hasCheckedFile(projectRoot, scoped) {
  return (
    runGit(projectRoot, [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      `:(literal)${scoped}`,
    ]).trim() !== ''
  );
}
