import { readFileSync, writeFileSync } from 'node:fs';
import { containedPath } from '../../../../core/fix/common/contained-path.mjs';

const PARSE_FAILURES = {
  'ruff-format-fix': {
    status: 2,
    stderr: 'error: Failed to parse x.py:1:1: Expected an expression\n',
  },
  'black-fix': { status: 123, stderr: 'error: cannot format -: Cannot parse: 1:0: BROKEN\n' },
};

function squeezed(source) {
  return source.replaceAll(/ {2,}/g, ' ');
}

export function fakePythonTools({ lintStatus = 0, lintEdit, formatFailure } = {}) {
  const calls = [];
  function lint(invocation) {
    const separator = invocation.args.indexOf('--');
    for (const file of invocation.args.slice(separator + 1)) {
      const target = containedPath(invocation.cwd, file);
      const edited = lintEdit?.(file, readFileSync(target, 'utf8'));
      if (edited !== undefined) {
        writeFileSync(target, edited);
      }
    }
    return { status: lintStatus, stdout: '', stderr: lintStatus === 0 ? '' : 'ruff exploded' };
  }
  function format(invocation) {
    if (formatFailure !== undefined) {
      return { status: 2, stdout: '', stderr: formatFailure };
    }
    if (invocation.input.includes('BROKEN')) {
      return { stdout: '', ...PARSE_FAILURES[invocation.operation] };
    }
    return { status: 0, stdout: squeezed(invocation.input), stderr: '' };
  }
  function executeFixCommand(invocation) {
    calls.push(invocation);
    if (invocation.operation === 'python-probe') {
      return { status: 1, stdout: '', stderr: '' };
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
