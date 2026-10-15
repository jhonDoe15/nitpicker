import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const fakeTools = path.join(import.meta.dirname, '../fixtures/fake-python-tools.mjs');
const TOOLS = [
  'ruff',
  'black',
  'coverage',
  'mypy',
  'pyright',
  'basedpyright',
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
