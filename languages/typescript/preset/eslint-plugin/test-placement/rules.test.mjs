import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule as noTestHelpersInSource } from './no-test-helpers-in-source.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});
const code = 'export const labels = [1, -1, 0];';

tester.run('no-test-helpers-in-source', noTestHelpersInSource, {
  valid: [
    { filename: 'src/main/features/labels/domain/labels.ts', code },
    { filename: 'src/main/features/labels/index.ts', code },
    { filename: 'src/main/features/contest/domain/contested.ts', code },
    { filename: 'src/main/features/labels/domain/testing-time.ts', code },
    {
      filename: 'core/diff/git/test-support/git-repository.mjs',
      code,
      options: [{ colocated: true }],
    },
    {
      filename: 'languages/preset/test-support/honesty/cases.mjs',
      code,
      options: [{ colocated: true }],
    },
  ],
  invalid: [
    {
      filename: 'src/main/features/labels/testing/make-labels.ts',
      code,
      errors: [{ messageId: 'testHelper', data: { name: 'testing/', testRoot: 'test' } }],
    },
    {
      filename: 'src/main/test-utils/build.ts',
      code,
      errors: [{ messageId: 'testHelper', data: { name: 'test-utils/', testRoot: 'test' } }],
    },
    {
      filename: 'src/main/features/labels/__mocks__/store.ts',
      code,
      errors: [{ messageId: 'testHelper', data: { name: '__mocks__/', testRoot: 'test' } }],
    },
    {
      filename: 'src/main/features/labels/test-utils.ts',
      code,
      errors: [{ messageId: 'testHelper', data: { name: 'test-utils.ts', testRoot: 'test' } }],
    },
    {
      filename: 'src/main/features/labels/labels.fixtures.ts',
      code,
      errors: [{ messageId: 'testHelper', data: { name: 'labels.fixtures.ts', testRoot: 'test' } }],
    },
    {
      filename: 'src/fixtures.ts',
      code,
      errors: [{ messageId: 'testHelper', data: { name: 'fixtures.ts', testRoot: 'test' } }],
    },
    {
      filename: 'src/main/features/labels/test-support/make-labels.ts',
      code,
      options: [{ testRoot: 'src/test' }],
      errors: [{ messageId: 'testHelper', data: { name: 'test-support/', testRoot: 'src/test' } }],
    },
    {
      filename: 'core/diff/testing/make-repository.mjs',
      code,
      options: [{ colocated: true }],
      errors: [{ messageId: 'colocatedTestHelper', data: { name: 'testing/' } }],
    },
    {
      filename: 'core/diff/test-utils.mjs',
      code,
      options: [{ colocated: true }],
      errors: [{ messageId: 'colocatedTestHelper', data: { name: 'test-utils.mjs' } }],
    },
  ],
});
