export function validateRunProfile(options) {
  if (options.quick && options.shardCount !== undefined) {
    throw new Error(
      '--quick cannot be combined with --shard-count or --shard-index: a sharded run is the full gate split across jobs, and a quick run is fast enough for one process.',
    );
  }
  if (options.staged && options.fix) {
    throw new Error(
      '--staged cannot be combined with --fix: the fixes land in the working tree, not in the index. Run nitpicker --fix first, stage the changes, then run nitpicker --staged.',
    );
  }
}
