import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const fakeTools = path.join(import.meta.dirname, 'fake-python-tools.mjs');
const TOOLS = [
  'ruff',
  'black',
  'coverage',
  'mypy',
  'pyright',
  'python',
  'python3',
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

export function installFakeUv(binDirectory) {
  install(
    binDirectory,
    'uv',
    'echo "$*" >> "$FAKE_UV_LOG"\nPATH="$3/.venv/bin:$PATH"\nshift 5\nexec "$@"',
  );
}

export function installFakePoetry(binDirectory, environmentDirectory) {
  install(binDirectory, 'poetry', `echo "${environmentDirectory}"`);
}
