import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FakeSpawnOptions, FakeSpawnResult } from './typed/fake-call.mts';
import { runFake } from './fake-tools/run-fake.mts';

const fakeTools = path.join(import.meta.dirname, '../fixtures/fake-python-tools.mjs');
const FAKE_MARKER = '# nitpicker fake python tool';
const TOOLS = [
  'ruff',
  'black',
  'coverage',
  'mypy',
  'pyright',
  'basedpyright',
  'python',
  'python3',
  'mutmut',
  'lint-imports',
];

function install(binDirectory: string, name: string, script: string): void {
  mkdirSync(binDirectory, { recursive: true });
  const target = path.join(binDirectory, name);
  writeFileSync(target, `#!/bin/sh\n${script}\n`);
  chmodSync(target, 0o755);
}

export function installFakeToolchain(binDirectory: string, tools: readonly string[] = TOOLS): void {
  for (const tool of tools) {
    install(
      binDirectory,
      tool,
      `${FAKE_MARKER}\nexec "${process.execPath}" "${fakeTools}" ${tool.replace('python3', 'python')} "$@"`,
    );
  }
}

export function installFakePoetry(binDirectory: string, environmentDirectory: string): void {
  install(binDirectory, 'poetry', `echo "${environmentDirectory}"`);
}

function isInstalledFake(command: string): boolean {
  return (
    path.dirname(command).endsWith(path.join('.venv', 'bin')) &&
    existsSync(command) &&
    readFileSync(command, 'utf8').includes(FAKE_MARKER)
  );
}

export function spawnFakeTools(
  command: string,
  args: readonly string[],
  options: FakeSpawnOptions,
): FakeSpawnResult {
  if (!isInstalledFake(command)) {
    return spawnSync(command, args, options);
  }
  const tool = path.basename(command).replace('python3', 'python');
  const { status, stdout, stderr } = runFake({ tool, args, cwd: options.cwd, env: options.env });
  return { status, signal: undefined, stdout, stderr, error: undefined };
}
