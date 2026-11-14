import { spawnSync } from 'node:child_process';

const PARSE_FAILURES = {
  'ruff-format-fix': {
    status: 2,
    stderr: 'error: Failed to parse x.py:1:1: Expected an expression\n',
  },
  'black-fix': { status: 123, stderr: 'error: cannot format -: Cannot parse: 1:0: BROKEN\n' },
};

const STDIN_FILENAME = '--stdin-filename=';

const JUPYTER_SKIP =
  'Skipping .ipynb files as Jupyter dependencies are not installed.\nYou can fix this by running ``pip install "black[jupyter]"``\n';

function squeezed(source) {
  return source.replaceAll(/ {2,}/g, ' ');
}

export function fakePythonTools({
  lintStatus = 0,
  lintEdit,
  formatFailure,
  poetryEnvironment,
  jupyterMissing = false,
  missingFormatter = false,
  sourceFixes = false,
  scanned = '{}',
} = {}) {
  const calls = [];
  function lint(invocation) {
    const file = invocation.args
      .find((arg) => arg.startsWith(STDIN_FILENAME))
      .slice(STDIN_FILENAME.length);
    const edited = lintEdit?.(file, invocation.input) ?? invocation.input;
    if (lintStatus !== 0) {
      return { status: lintStatus, stdout: '', stderr: 'ruff exploded' };
    }
    return { status: edited === invocation.input ? 0 : 1, stdout: edited, stderr: '' };
  }
  function format(invocation) {
    if (missingFormatter) {
      return {
        stdout: '',
        stderr: '',
        error: Object.assign(new Error('spawn'), { code: 'ENOENT' }),
      };
    }
    if (jupyterMissing && invocation.args.some((arg) => arg.endsWith('.ipynb'))) {
      return { status: 0, stdout: invocation.input, stderr: JUPYTER_SKIP };
    }
    if (formatFailure !== undefined) {
      return { status: 2, stdout: '', stderr: formatFailure };
    }
    if (invocation.input.includes('BROKEN')) {
      return { stdout: '', ...PARSE_FAILURES[invocation.operation] };
    }
    return { status: 0, stdout: squeezed(invocation.input), stderr: '' };
  }
  function sourceEdits(invocation) {
    if (!sourceFixes) {
      return { status: 0, stdout: '{"fixes":[],"declines":[]}', stderr: '' };
    }
    const run = spawnSync('python3', invocation.args, {
      input: invocation.input,
      encoding: 'utf8',
      timeout: 60_000,
    });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  }
  function executeFixCommand(invocation) {
    if (invocation.operation === 'python-fix-edits') {
      return sourceEdits(invocation);
    }
    calls.push(invocation);
    if (invocation.operation === 'python-probe') {
      if (invocation.args.some((arg) => arg.endsWith('import-scan.py'))) {
        return { status: 0, stdout: scanned, stderr: '' };
      }
      return invocation.command === 'poetry' && poetryEnvironment !== undefined
        ? { status: 0, stdout: `${poetryEnvironment}\n`, stderr: '' }
        : { status: 1, stdout: '', stderr: '' };
    }
    return invocation.operation === 'ruff-fix' ? lint(invocation) : format(invocation);
  }
  return {
    executeFixCommand,
    calls,
    operations: () => calls.map(({ operation }) => operation),
    callsOf: (operation) => calls.filter((call) => call.operation === operation),
  };
}
