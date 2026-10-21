import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../test-support/python-script-helpers.mjs';
import { createRuleChecker } from '../test-support/python-rule-harness.mjs';
import { ingestRulesReport } from '../../ingest/rules-report.mjs';
import { applyPythonExceptions } from '../../adapters/configuration/python-exceptions.mjs';
import { applyRuleHints } from '../rule-hints.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, single } = createScripts();
afterEach(cleanup);

function handler(body, caught = 'asyncio.CancelledError', imports = 'import asyncio') {
  return [
    imports,
    'async def run(operation, ready):',
    '    try:',
    '        await operation()',
    `    except ${caught} as error:`,
    ...body.split('\n').map((line) => `        ${line}`),
    '',
  ].join('\n');
}

const lost = ['cancellation-not-propagated:5 except asyncio.CancelledError'];

describe.skipIf(!enabled)('explicit cancellation handlers', () => {
  it('reports lost cancellation paths and avoids swallowed-error duplicates', () => {
    const cases = [
      ['return', 'return', lost],
      ['failure result carrying the error', 'return str(error)', lost],
      ['replace with a chained error', 'raise ValueError() from error', lost],
      ['log and fall through', 'logger.exception("cancelled")', lost],
      ['one branch returns', 'if ready:\n    return\nraise', lost],
      ['one branch falls through', 'if ready:\n    raise', lost],
      ['finally overrides re-raise', 'try:\n    raise\nfinally:\n    return', lost],
      ['finally replaces cancellation', 'try:\n    raise\nfinally:\n    raise ValueError()', lost],
      ['rebound error', 'error = ValueError()\nraise error', lost],
      ['nested definition is not propagation', 'def propagate():\n    raise\nreturn', lost],
      ['unreachable re-raise', 'return\nraise', lost],
      ['cleanup then return', 'await cleanup()\nreturn', lost],
    ].map(([name, body, expected]) => [name, handler(body), expected]);
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('accepts direct propagation and intentional scoped cancellation boundaries', () => {
    const cases = [
      ['bare re-raise', handler('raise'), []],
      ['unchanged error', handler('raise error'), []],
      [
        'unchanged error with traceback',
        handler('raise error.with_traceback(error.__traceback__)'),
        [],
      ],
      ['asyncio cancellation signal', handler('raise asyncio.CancelledError()'), []],
      ['cleanup before re-raise', handler('await cleanup()\nraise'), []],
      ['both branches propagate', handler('if ready:\n    raise\nelse:\n    raise error'), []],
      ['constant dead branch', handler('if False:\n    return\nraise'), []],
      ['unreachable return', handler('raise\nreturn'), []],
      ['finally propagates', handler('try:\n    cleanup()\nfinally:\n    raise'), []],
      [
        'shielded cleanup then re-raise',
        handler('with anyio.CancelScope(shield=True):\n    await cleanup()\nraise'),
        [],
      ],
      [
        'AnyIO scoped boundary',
        'import anyio\nasync def run(operation):\n    with anyio.move_on_after(1):\n        await operation()\n',
        [],
      ],
      [
        'Trio scoped boundary',
        'import trio\nasync def run(operation):\n    with trio.move_on_after(1):\n        await operation()\n',
        [],
      ],
      [
        'asyncio timeout boundary',
        'import asyncio\nasync def run(operation):\n    async with asyncio.timeout(1):\n        await operation()\n',
        [],
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('resolves backend imports without matching unrelated names or shadowed parameters', () => {
    const cases = [
      [
        'asyncio module alias',
        'return',
        'aio.CancelledError',
        'import asyncio as aio',
        ['cancellation-not-propagated:5 except aio.CancelledError'],
      ],
      [
        'asyncio class alias',
        'return',
        'Cancelled',
        'from asyncio import CancelledError as Cancelled',
        ['cancellation-not-propagated:5 except Cancelled'],
      ],
      [
        'Trio cancellation',
        'return',
        'trio.Cancelled',
        'import trio',
        ['cancellation-not-propagated:5 except trio.Cancelled'],
      ],
      [
        'AnyIO dynamic backend',
        'return',
        'cancelled()',
        'from anyio import get_cancelled_exc_class as cancelled',
        ['cancellation-not-propagated:5 except expression'],
      ],
      [
        'mixed tuple',
        'return',
        '(asyncio.CancelledError, ValueError)',
        'import asyncio',
        ['cancellation-not-propagated:5 except (asyncio.CancelledError, ValueError)'],
      ],
      ['Trio unchanged propagation', 'raise error', 'trio.Cancelled', 'import trio', []],
      [
        'AnyIO unchanged propagation',
        'raise',
        'cancelled()',
        'from anyio import get_cancelled_exc_class as cancelled',
        [],
      ],
      ['unrelated class', 'return str(error)', 'other.CancelledError', 'import other', []],
    ].map(([name, body, caught, imports, expected]) => [
      name,
      handler(body, caught, imports),
      expected,
    ]);
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
    expect(
      single(handler('return str(error)').replace('operation, ready', 'operation, ready, asyncio')),
    ).toEqual([]);
    expect(
      single(
        handler('return str(error)').replace('async def run', 'asyncio = other\nasync def run'),
      ),
    ).toEqual([]);
  });

  it('does not treat a return in a nested function as a cancellation exit', () => {
    expect(single(handler('def fallback():\n    return None\nraise'))).toEqual([]);
  });

  it('keeps complex nested exception and loop control outside the initial path model', () => {
    expect(
      single(handler('try:\n    cleanup()\nexcept ValueError:\n    recover(error)\nraise')),
    ).toEqual([]);
    expect(single(handler('while ready:\n    await cleanup()\nraise'))).toEqual([]);
  });

  it('passes the registered banned/allowed fixtures through the full AST adapter', () => {
    const check = createRuleChecker();

    expect(
      check({
        tool: 'python-rules',
        fixture: 'cancellation',
        rule: 'cancellation-not-propagated',
        mention: 'bare `raise`',
      }),
    ).toEqual({ ok: true, messages: [expect.stringContaining('bare `raise`')] });
  });

  it('preserves report identity after line movement and applies reviewed path exceptions', () => {
    const raw = [
      {
        rule: 'cancellation-not-propagated',
        path: 'src/worker.py',
        subject: 'except asyncio.CancelledError',
        line: 5,
      },
    ];
    const before = applyRuleHints(ingestRulesReport(JSON.stringify(raw)));
    const after = applyRuleHints(ingestRulesReport(JSON.stringify([{ ...raw[0], line: 8 }])));

    expect(after).toEqual([{ ...before[0], location: { line: 8 } }]);
    expect(before[0].classification).toBe('enforceable');
    expect(before[0].message).toContain(
      '"python.exceptions" entry for cancellation-not-propagated',
    );
    expect(
      applyPythonExceptions(after, [
        { rule: 'cancellation-not-propagated', paths: ['src/worker.py'] },
      ]),
    ).toEqual([]);
    expect(
      applyPythonExceptions(after, [{ rule: 'cancellation-not-propagated', paths: ['other.py'] }]),
    ).toEqual(after);
  });

  it('demonstrates cancellation propagation with the exact asyncio fixture functions', () => {
    const banned = readFileSync(
      new URL('../fixtures/cancellation/banned/worker.py', import.meta.url),
      'utf8',
    );
    const allowed = readFileSync(
      new URL('../fixtures/cancellation/allowed/worker.py', import.meta.url),
      'utf8',
    );
    const program = [
      'import asyncio, json',
      'async def operation():',
      '    await asyncio.Event().wait()',
      'async def outcome(source):',
      '    namespace = {}',
      '    exec(source, namespace)',
      '    task = asyncio.create_task(namespace["run"](operation))',
      '    await asyncio.sleep(0)',
      '    task.cancel()',
      '    try:',
      '        await task',
      '    except asyncio.CancelledError:',
      '        return "cancelled"',
      '    return "returned"',
      'async def main():',
      `    print(json.dumps([await outcome(${JSON.stringify(banned)}), await outcome(${JSON.stringify(allowed)})]))`,
      'asyncio.run(main())',
    ].join('\n');
    const result = spawnSync('python3', ['-I', '-c', program], {
      encoding: 'utf8',
      timeout: 10_000,
    });

    expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({
      status: 0,
      stderr: '',
      stdout: '["returned", "cancelled"]\n',
    });
  });
});
