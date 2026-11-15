import { spawnSync } from 'node:child_process';
import type { FixInvocation as CoreFixInvocation } from '../../../../core/fix/typed/fix-types.mts';

type FixInvocation = CoreFixInvocation & { operation?: string; acceptedStatuses?: number[] };

type FixReply = {
  status?: ReturnType<typeof spawnSync>['status'];
  stdout: string;
  stderr: string;
  error?: Error;
};

type FakeToolOptions = {
  lintStatus?: number;
  lintEdit?: (file: string, input: string) => string | undefined;
  formatFailure?: string;
  poetryEnvironment?: string;
  jupyterMissing?: true;
  missingFormatter?: true;
  sourceFixes?: true;
  scanned?: string;
};

export type FakePythonTools = {
  executeFixCommand: (invocation: FixInvocation) => FixReply;
  calls: FixInvocation[];
  operations: () => (string | undefined)[];
  callsOf: (operation: string) => FixInvocation[];
};

const PARSE_FAILURES: Readonly<Record<string, { status: number; stderr: string }>> = {
  'ruff-format-fix': {
    status: 2,
    stderr: 'error: Failed to parse x.py:1:1: Expected an expression\n',
  },
  'black-fix': { status: 123, stderr: 'error: cannot format -: Cannot parse: 1:0: BROKEN\n' },
};

const STDIN_FILENAME = '--stdin-filename=';

const JUPYTER_SKIP =
  'Skipping .ipynb files as Jupyter dependencies are not installed.\nYou can fix this by running ``pip install "black[jupyter]"``\n';

function inputOf({ input }: FixInvocation): string {
  return input ?? '';
}

function squeezed(source: string): string {
  return source.replaceAll(/ {2,}/g, ' ');
}

export function fakePythonTools({
  lintStatus = 0,
  lintEdit,
  formatFailure,
  poetryEnvironment,
  jupyterMissing,
  missingFormatter,
  sourceFixes,
  scanned = '{}',
}: FakeToolOptions = {}): FakePythonTools {
  const calls: FixInvocation[] = [];
  function lint(invocation: FixInvocation): FixReply {
    const file = (invocation.args.find((arg) => arg.startsWith(STDIN_FILENAME)) ?? '').slice(
      STDIN_FILENAME.length,
    );
    const edited = lintEdit?.(file, inputOf(invocation)) ?? inputOf(invocation);
    if (lintStatus !== 0) {
      return { status: lintStatus, stdout: '', stderr: 'ruff exploded' };
    }
    return { status: edited === inputOf(invocation) ? 0 : 1, stdout: edited, stderr: '' };
  }
  function format(invocation: FixInvocation): FixReply {
    if (missingFormatter) {
      return {
        stdout: '',
        stderr: '',
        error: Object.assign(new Error('spawn'), { code: 'ENOENT' }),
      };
    }
    if (jupyterMissing && invocation.args.some((arg) => arg.endsWith('.ipynb'))) {
      return { status: 0, stdout: inputOf(invocation), stderr: JUPYTER_SKIP };
    }
    if (formatFailure !== undefined) {
      return { status: 2, stdout: '', stderr: formatFailure };
    }
    if (inputOf(invocation).includes('BROKEN')) {
      return {
        stdout: '',
        ...(PARSE_FAILURES[invocation.operation ?? ''] ?? { status: 1, stderr: '' }),
      };
    }
    return { status: 0, stdout: squeezed(inputOf(invocation)), stderr: '' };
  }
  function sourceEdits(invocation: FixInvocation): FixReply {
    if (!sourceFixes) {
      return { status: 0, stdout: '{"fixes":[],"declines":[]}', stderr: '' };
    }
    const run = spawnSync('python3', invocation.args, {
      input: inputOf(invocation),
      encoding: 'utf8',
      timeout: 60_000,
    });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  }
  function executeFixCommand(invocation: FixInvocation): FixReply {
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
    callsOf: (operation: string) => calls.filter((call) => call.operation === operation),
  };
}
