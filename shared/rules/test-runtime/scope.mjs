export const TEST_RUNTIME_ANALYZER = 'test-runtime';

const OUT_OF_SCOPE_FOLDERS = new Set([
  'e2e',
  'end_to_end',
  'endtoend',
  'contract',
  'contracts',
  'e2etest',
  'endtoendtest',
  'contracttest',
]);

export function isEndToEndPath(file) {
  return file
    .split('/')
    .slice(0, -1)
    .some((segment) => OUT_OF_SCOPE_FOLDERS.has(segment.toLowerCase()));
}
