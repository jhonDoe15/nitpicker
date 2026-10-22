import { describe, expect, it } from 'vitest';
import { PLACE_FILE_VARIABLE, PLACE_TEST_VARIABLE } from '../console-report.mjs';
import { createMochaHooks } from './mocha-capture.mjs';

describe('the Mocha console hooks', () => {
  it('names the running test and its file while it runs, and nothing after it', () => {
    const environment = {};
    const hooks = createMochaHooks({ environment });
    const currentTest = { file: '/work/app/test/a.test.js', fullTitle: () => 'pick answers' };

    hooks.beforeEach.call({ currentTest });
    const during = { ...environment };
    hooks.afterEach.call({ currentTest });

    expect(during).toEqual({
      [PLACE_FILE_VARIABLE]: '/work/app/test/a.test.js',
      [PLACE_TEST_VARIABLE]: 'pick answers',
    });
    expect(environment).toEqual({ [PLACE_FILE_VARIABLE]: '', [PLACE_TEST_VARIABLE]: '' });
  });

  it('gives a test without a file no file', () => {
    const environment = {};

    createMochaHooks({ environment }).beforeEach.call({
      currentTest: { fullTitle: () => 'orphan' },
    });

    expect(environment).toEqual({ [PLACE_FILE_VARIABLE]: '', [PLACE_TEST_VARIABLE]: 'orphan' });
  });
});
