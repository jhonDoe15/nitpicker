export const TEST_PATTERNS = [
  'tests/*',
  'test/*',
  '*/tests/*',
  '*/test/*',
  'test_*.py',
  '*/test_*.py',
  '*_test.py',
  'conftest.py',
  '*/conftest.py',
];
const list = (items) => `[ ${items.map((item) => JSON.stringify(item)).join(', ')} ]`;
export const section = (sourcePaths, patterns = TEST_PATTERNS) =>
  `[tool.mutmut]\nsource_paths = ${list(sourcePaths)}\ndo_not_mutate = ${list(patterns)}\n`;
