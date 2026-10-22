import path from 'node:path';
import { LINES_VARIABLE, activeNames, captureConsole } from '../console-capture.mjs';
import { ROOT_VARIABLE } from '../console-report.mjs';

function nameOf(context) {
  return context.fullName ?? context.name;
}

function isTestProcess({ environment, argv }) {
  return environment.NODE_TEST_CONTEXT?.startsWith('child') === true && argv[1] !== undefined;
}

export function installNodeTestCapture({ hooks, target, environment, argv, directory }) {
  if (!isTestProcess({ environment, argv })) {
    return false;
  }
  const active = activeNames();
  hooks.beforeEach((context) => {
    active.enter(nameOf(context));
  });
  hooks.afterEach((context) => {
    active.leave(nameOf(context));
  });
  const file = path.resolve(argv[1]);
  captureConsole({
    target,
    linesPath: environment[LINES_VARIABLE],
    root: environment[ROOT_VARIABLE] ?? directory,
    locate: () => ({ file, test: active.current() }),
  });
  return true;
}
