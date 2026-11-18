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
  batchMget: [
    'Read the values with one `mget` per 500 keys before the loop, and look each one up in a `Map` in it.',
    'The values are read before the loop starts, so a key that changes while the loop runs is no longer seen.',
    'A key that holds a value of another type makes `get` throw, but `mget` returns `null` for it.',
  ].join(' '),
  batchWrite: [
    'Run the statement once per 500 keys instead of once per item. A chunk now succeeds or fails as a whole,',
    'and a column that the database sets on write (such as an update date) gets one value for the chunk.',
    'Entity listeners and subscribers run once per statement instead of once per item.',
  ].join(' '),
};
