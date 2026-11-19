export const MAPPERS: ReadonlySet<string> = new Set([
  'map',
  'mapNotNull',
  'mapIndexed',
  'mapIndexedNotNull',
  'flatMap',
  'forEach',
  'forEachIndexed',
  'onEach',
  'associate',
  'associateBy',
  'associateWith',
  'mapTo',
  'mapNotNullTo',
  'mapIndexedTo',
  'flatMapTo',
  'associateTo',
  'associateByTo',
  'associateWithTo',
]);

export const UNBOUNDED_EXECUTORS: ReadonlySet<string> = new Set([
  'newCachedThreadPool',
  'newVirtualThreadPerTaskExecutor',
  'newThreadPerTaskExecutor',
  'commonPool',
]);

export const BUILDERS: ReadonlySet<string> = new Set([
  'listOf',
  'setOf',
  'mapOf',
  'arrayOf',
  'listOfNotNull',
  'setOfNotNull',
  'sequenceOf',
  'intArrayOf',
  'longArrayOf',
  'enumValues',
  'enumEntries',
]);
