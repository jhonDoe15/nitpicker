export const CONFTEST = 'conftest.py';
export const INIT = '__init__.py';
export const RUNTIME = 'runtime';
export const TEST_RUNTIME_TOOL = 'test-runtime';
export const FRAMEWORK_CATEGORY = 'framework-production-runtime';
const END_TO_END_FOLDERS = new Set([
  'e2e',
  'end_to_end',
  'endtoend',
  'contract',
  'contracts',
  'e2etest',
  'endtoendtest',
  'contracttest',
]);

export function isEndToEndFolder(folder) {
  return END_TO_END_FOLDERS.has(folder.toLowerCase());
}
