import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const fakeTools = path.join(import.meta.dirname, '../fixtures/fake-python-tools.cjs');
const { runFake } = createRequire(import.meta.url)(fakeTools);
const TOOLS = [
  'ruff',
  'black',
  'coverage',
  'mypy',
  'pyright',
  'python',
  'python3',
  'lizard',
  'mutmut',
  'lint-imports',
];

function install(binDirectory, name, script) {
  mkdirSync(binDirectory, { recursive: true });
  const target = path.join(binDirectory, name);
  writeFileSync(target, `#!/bin/sh\n${script}\n`);
  chmodSync(target, 0o755);
}

export function installFakeToolchain(binDirectory, tools = TOOLS) {
  for (const tool of tools) {
    install(
      binDirectory,
      tool,
      `exec "${process.execPath}" "${fakeTools}" ${tool.replace('python3', 'python')} "$@"`,
    );
  }
}

export function installFakePoetry(binDirectory, environmentDirectory) {
  install(binDirectory, 'poetry', `echo "${environmentDirectory}"`);
}

export function spawnFakeTools(realSpawn) {
  return (command, args, options) => {
    const tool = path.basename(command);
    const installed =
      path.dirname(command).endsWith(path.join('.venv', 'bin')) &&
      existsSync(command) &&
      readFileSync(command, 'utf8').includes(fakeTools);
    if (!installed) {
      return realSpawn(command, args, options);
    }
    const { status, stdout, stderr } = runFake({
      tool: tool.replace('python3', 'python'),
      args,
      cwd: options.cwd,
      env: options.env,
    });
    return { status, signal: undefined, stdout, stderr, error: undefined };
  };
}
