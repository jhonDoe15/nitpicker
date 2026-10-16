'use strict';

const { afterEach, mock } = process.getBuiltinModule('node:test');

const execArguments = process.execArgv;

function preloadedWithRequire() {
  return execArguments.some(
    (argument, index) => argument === __filename && execArguments[index - 1] === '--require',
  );
}

const startsTestProcesses =
  execArguments.includes('--test') && process.env.NODE_TEST_CONTEXT === undefined;

if (!startsTestProcesses || !preloadedWithRequire()) {
  afterEach(() => {
    mock.restoreAll();
  });
}
