import {
  mochaLoadArguments,
  mochaModulePath,
  projectMocha,
} from '../../test-runner/test-files/mocha-options.mts';
import { MOCHA_OPTIONS_NITPICKER_SETS } from '../../test-runner/runners.mts';
import { withoutOptions } from '../../test-runner/script-command.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { loadInChild, loaderScript } from '../config-module.mts';

const OPTIONS_SCRIPT = loaderScript(
  "const { createRequire } = await import('node:module');",
  'delete process.env.MOCHA_OPTIONS;',
  'const { loadOptions } = createRequire(process.argv[1])(process.argv[1]);',
  'report({ value: { retries: loadOptions(JSON.parse(process.argv[2])).retries } });',
);

export function mochaConfigRetries({
  projectRoot,
  liveRoot,
  tokens,
  timeoutMs,
}: {
  readonly projectRoot: string;
  readonly liveRoot: string;
  readonly tokens: readonly string[];
  readonly timeoutMs?: number | undefined;
}): unknown {
  const mocha = projectMocha(projectRoot) ?? projectMocha(liveRoot);
  if (mocha === undefined) {
    throw new Error(`Mocha is not installed in ${liveRoot}, so its config cannot be read`);
  }
  const loadArguments = mochaLoadArguments(
    projectRoot,
    withoutOptions(tokens, MOCHA_OPTIONS_NITPICKER_SETS),
  );
  const loaded = loadInChild({
    script: OPTIONS_SCRIPT,
    args: [mochaModulePath(mocha, 'options'), JSON.stringify(loadArguments)],
    name: 'the Mocha config',
    projectRoot,
    timeoutMs,
  });
  return fieldOf(loaded, 'retries');
}
