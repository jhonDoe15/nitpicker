import path from 'node:path';
import { PLACE_FILE_VARIABLE, PLACE_TEST_VARIABLE } from '../console-report.mjs';

export function createMochaHooks({ environment }) {
  return {
    beforeEach() {
      const { file } = this.currentTest;
      environment[PLACE_FILE_VARIABLE] = file === undefined ? '' : path.resolve(file);
      environment[PLACE_TEST_VARIABLE] = this.currentTest.fullTitle();
    },
    afterEach() {
      environment[PLACE_FILE_VARIABLE] = '';
      environment[PLACE_TEST_VARIABLE] = '';
    },
  };
}
