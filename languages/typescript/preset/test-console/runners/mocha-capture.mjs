import path from 'node:path';
import { LINES_VARIABLE, captureConsole } from '../console-capture.mjs';
import { ROOT_VARIABLE } from '../console-report.mjs';

export function createMochaHooks({ target, environment, directory }) {
  const outside = { file: '', test: '' };
  let current = outside;
  captureConsole({
    target,
    linesPath: environment[LINES_VARIABLE],
    root: environment[ROOT_VARIABLE] ?? directory,
    locate: () => current,
  });
  return {
    beforeEach() {
      const { file } = this.currentTest;
      current = {
        file: file === undefined ? '' : path.resolve(file),
        test: this.currentTest.fullTitle(),
      };
    },
    afterEach() {
      current = outside;
    },
  };
}
