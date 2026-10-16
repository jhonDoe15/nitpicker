import { existsSync } from 'node:fs';
import path from 'node:path';
import { readManifest } from '../eslint-config/scope-support.mjs';
import { DEFAULT_TEST_RUNNER, RUNNER_PACKAGES } from './runners.mjs';
import { parseTestCommand } from './script-command.mjs';

const SCRIPT_REFERENCE =
  /(?<=^|&&|\|\||;)\s*(?:npm|pnpm|yarn|bun)\s+(?:run(?:-script)?\s+)?(?<name>[\w:.-]+)(?:\s+--(?<rest>(?:\s+[^\s&;|]+)*))?\s*(?=$|&&|\|\||;)/gu;

const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'];

const CONFIG_FILES = [
  ['vitest', ['vitest.config', 'vitest.workspace']],
  ['jest', ['jest.config']],
  ['mocha', ['.mocharc']],
];

const MOCHA_CONFIG_EXTRA = ['.mocharc.yml', '.mocharc.yaml', '.mocharc.jsonc'];

function textBefore(command, index) {
  const before = command.slice(0, index).trimEnd();
  return before === '' ? '' : `${before} `;
}

function scriptReferences(command) {
  return [...command.matchAll(SCRIPT_REFERENCE)].map((match) => ({
    name: match.groups.name,
    prefix: textBefore(command, match.index),
    rest: (match.groups.rest ?? '').trimEnd(),
  }));
}

function expandedCommands(scripts, name) {
  const pending = [{ name, prefix: '', suffix: '' }];
  const seen = new Set([name]);
  const commands = [];
  for (const current of pending) {
    const command = scripts[current.name];
    if (typeof command !== 'string') {
      continue;
    }
    commands.push(`${current.prefix}${command}${current.suffix}`);
    const references = scriptReferences(command).filter((reference) => !seen.has(reference.name));
    for (const reference of references) {
      seen.add(reference.name);
      pending.push({
        name: reference.name,
        prefix: `${current.prefix}${reference.prefix}`,
        suffix: `${reference.rest}${current.suffix}`,
      });
    }
  }
  return commands;
}

function testScriptNames(scripts) {
  const names = Object.keys(scripts).filter((name) => name !== 'test' && name.startsWith('test'));
  return [...new Set(['test', ...names])];
}

function manifestScripts(manifest) {
  const scripts = manifest?.scripts;
  return typeof scripts === 'object' && scripts !== null ? scripts : {};
}

function scriptRunner(scripts, configured) {
  for (const name of testScriptNames(scripts)) {
    const found = expandedCommands(scripts, name)
      .map((command) => ({ command, parsed: parseTestCommand(command, configured) }))
      .find(({ parsed }) => parsed !== undefined);
    if (found !== undefined) {
      return { name, runner: found.parsed.runner, command: found.command };
    }
  }
  return undefined;
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
  const script = scriptRunner(manifestScripts(manifest), undefined);
  if (script !== undefined) {
    return {
      runner: script.runner,
      evidence: `package.json script "${script.name}"`,
      command: script.command,
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

export function testRunnerFor(projectRoot, configured) {
  return configured === undefined
    ? detectTestRunner(projectRoot)
    : {
        runner: configured,
        evidence: 'nitpicker.config.json "tools.tests.runner"',
        command: scriptRunner(manifestScripts(readManifest(projectRoot)), configured)?.command,
      };
}
