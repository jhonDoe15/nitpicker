const READ_BEFORE =
  'The rows are read before the loop starts, so a row that changes while the loop runs is no longer seen.';

export const IO_IN_LOOP_SUGGESTIONS = {
  batchLookup: [
    'Load the rows with one query per 500 keys before the loop, and read them from a `Map` in it.',
    'Keys that repeat share one row object: do not change it.',
    READ_BEFORE,
  ].join(' '),
  batchGroups: [
    'Load the rows of all the keys with one query per 500 keys before the loop, group them in a `Map`,',
    'and read each group from it. Keys that repeat share one array: do not change it.',
    READ_BEFORE,
  ].join(' '),
};
