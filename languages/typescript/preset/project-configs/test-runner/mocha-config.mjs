import {
  mochaLoadArguments,
  mochaModulePath,
  projectMocha,
} from '../../test-runner/mocha-options.mjs';
import { MOCHA_OPTIONS_NITPICKER_SETS } from '../../test-runner/runners.mjs';
import { withoutOptions } from '../../test-runner/script-command.mjs';
import { loadInChild, loaderScript } from '../config-module.mjs';

const OPTIONS_SCRIPT = loaderScript(
  "const { createRequire } = await import('node:module');",
  'delete process.env.MOCHA_OPTIONS;',
  'const { loadOptions } = createRequire(process.argv[1])(process.argv[1]);',
  'report({ value: { retries: loadOptions(JSON.parse(process.argv[2])).retries } });',
);

export function mochaConfigRetries({ projectRoot, liveRoot, tokens, timeoutMs }) {
  const mocha = projectMocha(projectRoot) ?? projectMocha(liveRoot);
  if (mocha === undefined) {
    throw new Error(`Mocha is not installed in ${liveRoot}, so its config cannot be read`);
  }
  const loadArguments = mochaLoadArguments(
    projectRoot,
    withoutOptions(tokens, MOCHA_OPTIONS_NITPICKER_SETS),
  );
  return loadInChild({
    script: OPTIONS_SCRIPT,
    args: [mochaModulePath(mocha, 'options'), JSON.stringify(loadArguments)],
    name: 'the Mocha config',
    projectRoot,
    timeoutMs,
  }).retries;
}
