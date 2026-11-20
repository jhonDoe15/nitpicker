type GitRunner = (root: string, args: readonly string[]) => string;

export function diffFromBase({
  runGit,
  baselineRoot,
  projectRoot,
  args,
  pathspec = [],
}: {
  readonly runGit: GitRunner;
  readonly baselineRoot: string;
  readonly projectRoot: string;
  readonly args: readonly string[];
  readonly pathspec?: readonly string[];
}): string {
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
