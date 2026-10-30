import { existsSync, realpathSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { resolveProjectRoot } from '../tooling/tool-resolution.mjs';

export function resolveRunTarget({ options, currentProjectRoot, workingDirectory }) {
  const paths = options.paths ?? [];
  if (paths.length === 0) {
    return {
      currentProjectRoot:
        currentProjectRoot === undefined ? resolveProjectRoot() : realpathSync(currentProjectRoot),
    };
  }
  const base = realpathSync(workingDirectory ?? process.cwd());
  const repositoryRoot = git(base, ['rev-parse', '--show-toplevel']).trim();
  const targets = paths.map((given) => ({
    given,
    absolute: existingPath({ base, repositoryRoot, given }),
  }));
  const projectRoot = projectOf(targets[0].absolute);
  const relativePaths = targets.map((target) => scopePath(projectRoot, target));
  return {
    currentProjectRoot: projectRoot,
    scope: relativePaths.includes('.') ? undefined : { paths: [...new Set(relativePaths)].sort() },
  };
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
}

function existingPath({ base, repositoryRoot, given }) {
  const absolute = path.resolve(base, given);
  if (path.relative(repositoryRoot, absolute).startsWith('..')) {
    throw new Error(`${given} is outside the repository ${repositoryRoot}`);
  }
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
  const scoped = relative === '' ? '.' : relative.split(path.sep).join('/');
  if (!hasCheckedFile(projectRoot, scoped)) {
    throw new Error(`${given} matches no file that nitpicker checks (none tracked or untracked)`);
  }
  return scoped;
}

function hasCheckedFile(projectRoot, scoped) {
  const listed = git(projectRoot, [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    `:(literal)${scoped}`,
  ]);
  return listed.trim() !== '';
}
