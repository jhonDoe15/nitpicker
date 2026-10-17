export const TEST_PATTERNS = [
  'tests/*',
  'test/*',
  '*/tests/*',
  '*/test/*',
  'test_*.py',
  '*/test_*.py',
  '*_test.py',
  '*/*_test.py',
  'conftest.py',
  '*/conftest.py',
];
function list(items) {
  return `[ ${items.map((item) => JSON.stringify(item)).join(', ')} ]`;
}

export function section(sourcePaths, patterns = TEST_PATTERNS) {
  return `[tool.mutmut]\nsource_paths = ${list(sourcePaths)}\ndo_not_mutate = ${list(patterns)}\n`;
}
