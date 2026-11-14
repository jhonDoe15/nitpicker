import { nearestTestFile } from '../../plan-parts/files.mjs';

export function testFileContext(finding, env) {
  const found = nearestTestFile(finding.path, (candidate) => env.exists(candidate));
  return found === undefined ? undefined : { testFile: found };
}

export function testStep(found, symbol) {
  if (found === undefined) {
    return `Add a test file for ${symbol ?? 'this code'} next to the other tests.`;
  }
  return found.exists
    ? `Add the test to ${found.path}.`
    : `Create ${found.path} for the test, following the other test files of the project.`;
}
