export function diffFromBase({ runGit, baselineRoot, projectRoot, args, pathspec = [] }) {
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
