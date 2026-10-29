import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const repositoryRoot = path.join(import.meta.dirname, '../../../../../..');

const EXECUTABLE_MODE = 0o755;

const STEP_TIMEOUT_MS = 120_000;

export function readAction() {
  return parse(readFileSync(path.join(repositoryRoot, 'action.yml'), 'utf8'));
}

const FAKE_NPX = `#!/usr/bin/env bash
printf '%s\\n' "npx $*" >> "$FAKE_LOG"
while [ "$1" != nitpicker ]; do shift; done
shift
case "$*" in
  --help) exit "\${FAKE_HELP_EXIT:-0}" ;;
  base*)
    if [ -n "\${FAKE_NO_BASE:-}" ]; then
      echo 'nitpicker failed: Unknown argument: base' >&2
      exit 2
    fi
    exec node "$NITPICKER_CLI" "$@"
    ;;
  "cache publish") exit 0 ;;
  *) exit "\${FAKE_GATE_EXIT:-0}" ;;
esac
`;

const FAKE_CYGPATH = `#!/usr/bin/env bash
case "$1" in
  -m) printf 'C:%s\\n' "$2" ;;
  -u) printf '%s\\n' "\${FAKE_UNIX_WORKSPACE:-$2}" ;;
esac
`;

export function windowsTools(root) {
  const bin = path.join(root, 'windows-bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'cygpath'), FAKE_CYGPATH);
  chmodSync(path.join(bin, 'cygpath'), EXECUTABLE_MODE);
  return bin;
}

const FAKE_COMMAND = `#!/usr/bin/env bash
printf '%s\\n' "$(basename "$0") $* (in $PWD)" >> "$FAKE_LOG"
`;

export function actionStep(name) {
  const step = readAction().runs.steps.find(
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

function prepareRunner(root) {
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
    chmodSync(path.join(bin, name), EXECUTABLE_MODE);
  }
  return bin;
}

export function executeStep({ step, root, cwd, environment, searchPath }) {
  const bin = prepareRunner(root);
  const outputFile = path.join(root, 'github-output.txt');
  const log = path.join(root, 'commands.log');
  writeFileSync(outputFile, '');
  writeFileSync(log, '');
  const script = path.join(root, 'step.sh');
  writeFileSync(script, step.run);
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
    cwd,
    encoding: 'utf8',
    timeout: STEP_TIMEOUT_MS,
    env: {
      HOME: root,
      GITHUB_OUTPUT: outputFile,
      GITHUB_WORKSPACE: root,
      FAKE_LOG: log,
      NITPICKER_CLI: path.join(repositoryRoot, 'core/cli.mjs'),
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      ...environment,
      PATH: `${bin}:${searchPath}`,
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
