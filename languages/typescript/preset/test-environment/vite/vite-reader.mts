import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mts';
import { messageOf } from '../../../../../shared/values/readers.mts';
import { readConfigInChild } from '../read-environment.mts';
import { loadInChild, loaderScript } from '../typed/child-views.mts';
import type { ConfigOutcome } from '../typed/environment-types.mts';

type ViteRequest = {
  readonly configFile: string;
  readonly projectRoot: string;
  readonly resolveRoots: readonly string[];
  readonly timeoutMs?: number | undefined;
};

type MochaRequest = {
  readonly projectRoot: string;
  readonly liveProjectRoot?: string | undefined;
  readonly tokens: readonly string[];
  readonly timeoutMs?: number | undefined;
};

const MOCHA_OPTIONS_MODULE = checkoutModuleUrl(
  new URL('../../test-runner/test-files/mocha-options.mjs', import.meta.url),
).href;

const MOCHA_SCRIPT = loaderScript(
  `const { loadedMochaOptions } = await import(${JSON.stringify(MOCHA_OPTIONS_MODULE)});`,
  'const [projectRoot, liveProjectRoot, ...tokens] = process.argv.slice(1);',
  'report({ value: await loadedMochaOptions({ projectRoot, liveProjectRoot, tokens }) });',
);

function outcomeOf(load: () => unknown): ConfigOutcome {
  try {
    return { result: load() };
  } catch (error) {
    return { failure: messageOf(error) };
  }
}

export function readViteConfig({
  configFile,
  projectRoot,
  resolveRoots,
  timeoutMs,
}: ViteRequest): ConfigOutcome {
  return outcomeOf(() => readConfigInChild({ configFile, projectRoot, resolveRoots, timeoutMs }));
}

export function readMochaOptions({
  projectRoot,
  liveProjectRoot = projectRoot,
  tokens,
  timeoutMs,
}: MochaRequest): ConfigOutcome {
  return outcomeOf(() =>
    loadInChild({
      script: MOCHA_SCRIPT,
      args: [projectRoot, liveProjectRoot, ...tokens],
      name: 'the Mocha config',
      projectRoot,
      timeoutMs,
    }),
  );
}
