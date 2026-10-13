import { runGit } from '../../diff/git.mjs';

export function diffFromBase({ baselineRoot, projectRoot, args, pathspec = [] }) {
  const baseCommit = runGit(baselineRoot, ['rev-parse', 'HEAD']).trim();
  return runGit(projectRoot, [
    '-c',
    'core.quotePath=false',
    'diff',
    ...args,
    baseCommit,
    'HEAD',
    ...pathspec,
  ]);
}
