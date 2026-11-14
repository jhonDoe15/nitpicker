import { existsSync, realpathSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { resolveProjectRoot } from '../configuration/project-checks/project-root.mjs';

type TargetRequest = {
  readonly options: { readonly paths?: readonly string[] | undefined };
  readonly currentProjectRoot?: string | undefined;
  readonly workingDirectory?: string | undefined;
  readonly missingPathHint: (given: string) => string;
};

type RunTarget = {
  readonly currentProjectRoot: string;
  readonly scope?: { readonly paths: string[] } | undefined;
};

type Target = { readonly given: string; readonly absolute: string };

const projectRootOf: (start?: string) => string = resolveProjectRoot;

const GIT_OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;
const GIT_TIMEOUT_MS = 10 * 60 * 1000;

export function resolveRunTarget({
  options,
  currentProjectRoot,
  workingDirectory,
  missingPathHint,
}: TargetRequest): RunTarget {
  const paths = options.paths ?? [];
  if (paths.length === 0) {
    return {
      currentProjectRoot:
        currentProjectRoot === undefined
          ? projectRootOf(workingDirectory)
          : realpathSync(currentProjectRoot),
    };
  }
  const base = realpathSync(workingDirectory ?? process.cwd());
  const repositoryRoot = repositoryOf(base);
  const targets = paths.map((given) => ({
    given,
    absolute: existingPath({ base, repositoryRoot, given, missingPathHint }),
  }));
  const projectRoot = projectOf(targets[0]?.absolute ?? base);
  const relativePaths = targets.map((target) => scopePath(projectRoot, target));
  return {
    currentProjectRoot: projectRoot,
    scope: relativePaths.includes('.') ? undefined : { paths: [...new Set(relativePaths)].sort() },
  };
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
    timeout: GIT_TIMEOUT_MS,
  });
}

function repositoryOf(base: string): string {
  try {
    return git(base, ['rev-parse', '--show-toplevel']).trim();
  } catch (error) {
    throw new Error(
      `${base} is not in a Git repository; run nitpicker from inside the repository`,
      {
        cause: error,
      },
    );
  }
}

function existingPath({
  base,
  repositoryRoot,
  given,
  missingPathHint,
}: {
  readonly base: string;
  readonly repositoryRoot: string;
  readonly given: string;
  readonly missingPathHint: (given: string) => string;
}): string {
  const absolute = path.resolve(base, given);
  if (path.relative(repositoryRoot, absolute).startsWith('..')) {
    throw new Error(`${given} is outside the repository ${repositoryRoot}`);
  }
  if (!existsSync(absolute)) {
    throw new Error(`${given} matches no file${missingPathHint(given)}`);
  }
  const target = realpathSync(absolute);
  const inRepository = path.relative(repositoryRoot, target);
  if (inRepository.startsWith('..') || inRepository.split(path.sep).includes('.git')) {
    throw new Error(`${given} leads to ${target}, outside the files of ${repositoryRoot}`);
  }
  return target;
}

function projectOf(absolute: string): string {
  return projectRootOf(statSync(absolute).isDirectory() ? absolute : path.dirname(absolute));
}

function scopePath(projectRoot: string, { given, absolute }: Target): string {
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

function hasCheckedFile(projectRoot: string, scoped: string): boolean {
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
