import { existsSync } from 'node:fs';
import path from 'node:path';
import { readManifest } from '../eslint-config/scope-support.mjs';
import { DEFAULT_TEST_RUNNER, RUNNER_PACKAGES } from './runners.mjs';

const BOUNDARY = String.raw`(?:^|[\s/&;|(=])`;
const END = String.raw`(?=$|[\s&;|)])`;

const SCRIPT_PATTERNS = [
  ['vitest', new RegExp(`${BOUNDARY}vitest${END}`, 'u')],
  ['jest', new RegExp(`${BOUNDARY}(?:jest|react-scripts\\s+test|craco\\s+test)${END}`, 'u')],
  ['mocha', new RegExp(`${BOUNDARY}mocha${END}`, 'u')],
  ['node', new RegExp(`${BOUNDARY}(?:(?:node|tsx)\\b[^&;|]*\\s--test|borp)${END}`, 'u')],
];

const SCRIPT_REFERENCE = /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?<name>[\w:-]+)\s*$/u;

const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'];

const CONFIG_FILES = [
  ['vitest', ['vitest.config', 'vitest.workspace']],
  ['jest', ['jest.config']],
  ['mocha', ['.mocharc']],
];

const MOCHA_CONFIG_EXTRA = ['.mocharc.yml', '.mocharc.yaml', '.mocharc.jsonc'];

function runnerInCommand(command) {
  const hits = SCRIPT_PATTERNS.map(([runner, pattern]) => ({
    runner,
    index: command.search(pattern),
  })).filter(({ index }) => index >= 0);
  return hits.toSorted((left, right) => left.index - right.index)[0]?.runner;
}

function scriptRunner(scripts, name) {
  const pending = [name];
  for (const current of pending) {
    const command = scripts[current];
    if (typeof command !== 'string') {
      return undefined;
    }
    const runner = runnerInCommand(command);
    if (runner !== undefined) {
      return { runner, command };
    }
    const reference = SCRIPT_REFERENCE.exec(command.trim())?.groups?.name;
    if (reference !== undefined && !pending.includes(reference)) {
      pending.push(reference);
    }
  }
  return undefined;
}

function runnerFromScripts(scripts) {
  const testScripts = Object.keys(scripts).filter(
    (name) => name !== 'test' && name.startsWith('test'),
  );
  return [...new Set(['test', ...testScripts])]
    .map((name) => ({ name, found: scriptRunner(scripts, name) }))
    .find(({ found }) => found !== undefined);
}

function configFileNames(runner) {
  const bases = CONFIG_FILES.find(([candidate]) => candidate === runner)[1];
  const names = bases.flatMap((base) =>
    CONFIG_EXTENSIONS.map((extension) => `${base}.${extension}`),
  );
  return runner === 'mocha' ? [...names, ...MOCHA_CONFIG_EXTRA] : names;
}

function hasProjectFile(projectRoot, name) {
  const file = path.resolve(projectRoot, name);
  if (!file.startsWith(`${projectRoot}${path.sep}`)) {
    return false;
  }
  return existsSync(file);
}

function runnerFromConfigFiles(projectRoot, manifest) {
  return CONFIG_FILES.map(([runner]) => runner)
    .map((runner) => ({
      runner,
      file:
        configFileNames(runner).find((name) => hasProjectFile(projectRoot, name)) ??
        (manifest[runner] === undefined ? undefined : `package.json "${runner}"`),
    }))
    .find(({ file }) => file !== undefined);
}

function runnerFromDependencies(manifest) {
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  return Object.entries(RUNNER_PACKAGES).find(([, name]) => names.has(name))?.[0];
}

export function detectTestRunner(projectRoot) {
  const manifest = readManifest(projectRoot) ?? {};
  const script = runnerFromScripts(
    typeof manifest.scripts === 'object' && manifest.scripts !== null ? manifest.scripts : {},
  );
  if (script !== undefined) {
    return {
      runner: script.found.runner,
      evidence: `package.json script "${script.name}"`,
      command: script.found.command,
    };
  }
  const config = runnerFromConfigFiles(projectRoot, manifest);
  if (config !== undefined) {
    return { runner: config.runner, evidence: config.file };
  }
  const dependency = runnerFromDependencies(manifest);
  if (dependency !== undefined) {
    return { runner: dependency, evidence: `the ${RUNNER_PACKAGES[dependency]} dependency` };
  }
  return { runner: DEFAULT_TEST_RUNNER, evidence: 'the default' };
}

function commandForRunner(projectRoot, runner) {
  const scripts = readManifest(projectRoot)?.scripts ?? {};
  const found = runnerFromScripts(typeof scripts === 'object' && scripts !== null ? scripts : {});
  return found?.found.runner === runner ? found.found.command : undefined;
}

export function testRunnerFor(projectRoot, configured) {
  return configured === undefined
    ? detectTestRunner(projectRoot)
    : {
        runner: configured,
        evidence: 'nitpicker.config.json "tools.tests.runner"',
        command: commandForRunner(projectRoot, configured),
      };
}
