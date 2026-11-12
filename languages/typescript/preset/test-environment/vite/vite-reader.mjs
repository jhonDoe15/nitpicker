import { loadInChild, loaderScript } from '../../project-configs/config-module.mjs';
import { readConfigInChild } from '../read-environment.mjs';

const MOCHA_OPTIONS_MODULE = new URL(
  '../../test-runner/test-files/mocha-options.mjs',
  import.meta.url,
).href;

const MOCHA_SCRIPT = loaderScript(
  `const { loadedMochaOptions } = await import(${JSON.stringify(MOCHA_OPTIONS_MODULE)});`,
  'const [projectRoot, liveProjectRoot, ...tokens] = process.argv.slice(1);',
  'report({ value: await loadedMochaOptions({ projectRoot, liveProjectRoot, tokens }) });',
);

function outcomeOf(load) {
  try {
    return { result: load() };
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error) };
  }
}

export function readViteConfig({ configFile, projectRoot, resolveRoots, timeoutMs }) {
  return outcomeOf(() => readConfigInChild({ configFile, projectRoot, resolveRoots, timeoutMs }));
}

export function readMochaOptions({
  projectRoot,
  liveProjectRoot = projectRoot,
  tokens,
  timeoutMs,
}) {
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
