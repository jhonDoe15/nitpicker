import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const repositoryRoot = path.join(import.meta.dirname, '../../../../../..');

export const ACTION = parse(readFileSync(path.join(repositoryRoot, 'action.yml'), 'utf8'));

const FAKE_NPX = `#!/usr/bin/env bash
printf '%s\\n' "npx $*" >> "$FAKE_LOG"
shift 2
case "$*" in
  --help) exit "\${FAKE_HELP_EXIT:-0}" ;;
  base*) exec node "$NITPICKER_CLI" "$@" ;;
  "cache publish") exit 0 ;;
  *) exit "\${FAKE_GATE_EXIT:-0}" ;;
esac
`;

const FAKE_COMMAND = `#!/usr/bin/env bash
printf '%s\\n' "$(basename "$0") $* (in $PWD)" >> "$FAKE_LOG"
`;

export function runStep(name) {
  const step = ACTION.runs.steps.find(
    (candidate) => candidate.id === name || candidate.name === name,
  );
  if (step?.run === undefined) {
    throw new Error(`action.yml has no run step ${name}`);
  }
  return step;
}

function parseOutputs(text) {
  return Object.fromEntries(
    text
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
}

export function prepareRunner(root) {
  const bin = path.join(root, 'fake-bin');
  mkdirSync(bin, { recursive: true });
  for (const [name, text] of [
    ['npx', FAKE_NPX],
    ['npm', FAKE_COMMAND],
    ['pnpm', FAKE_COMMAND],
    ['yarn', FAKE_COMMAND],
    ['corepack', FAKE_COMMAND],
  ]) {
    writeFileSync(path.join(bin, name), text);
    chmodSync(path.join(bin, name), 0o755);
  }
  return bin;
}

export function executeStep({ name, root, cwd, environment }) {
  const step = runStep(name);
  const bin = prepareRunner(root);
  const outputFile = path.join(root, `output-${name.replaceAll(' ', '-')}.txt`);
  const log = path.join(root, 'commands.log');
  writeFileSync(outputFile, '');
  writeFileSync(log, '');
  const script = path.join(root, 'step.sh');
  writeFileSync(script, step.run);
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
    cwd,
    encoding: 'utf8',
    env: {
      HOME: root,
      GITHUB_OUTPUT: outputFile,
      GITHUB_WORKSPACE: root,
      FAKE_LOG: log,
      NITPICKER_CLI: path.join(repositoryRoot, 'core/cli.mjs'),
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      ...environment,
      PATH: `${bin}:${environment.PATH ?? process.env.PATH}`,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    outputs: parseOutputs(readFileSync(outputFile, 'utf8')),
    commands: existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [],
  };
}
