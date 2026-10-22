import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';
import { createRuleChecker } from '../../test-support/python-rule-harness.mjs';
import { ingestRulesReport } from '../../../ingest/rules-report.mjs';
import { applyPythonExceptions } from '../../../adapters/configuration/python-exceptions.mjs';
import { applyRuleHints } from '../../rule-hints.mjs';

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
const BASE_MESSAGE = [
  '`except asyncio.CancelledError` has a path that consumes cancellation or replaces it with another error.',
  'After cleanup, use a bare `raise` or re-raise the unchanged caught cancellation.',
  "Keep intentional cancellation boundaries in the backend's timeout or cancellation scope; returning a failure result or chaining another error does not propagate cancellation.",
].join(' ');
const messageFor = (file) =>
  `${BASE_MESSAGE} If this is intended, add {"rule":"cancellation-not-propagated","paths":["${file}"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.`;

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
      ['redefined caught name', 'def error():\n    pass\nraise error', lost],
      [
        'import replaces caught name',
        'from builtins import ValueError as error\nraise error',
        lost,
      ],
      ['nested definition is not propagation', 'def propagate():\n    raise\nreturn', lost],
      ['unreachable re-raise', 'return\nraise', lost],
      ['cleanup then return', 'await cleanup()\nreturn', lost],
      ['loop that may finish without raising', 'for task in ready:\n    task.cancel()', lost],
      ['return inside a loop', 'for task in ready:\n    return\nraise', lost],
      ['break out of a loop only', 'while ready:\n    break\nawait cleanup()', lost],
      ['loop else falls through', 'for task in ready:\n    pass\nelse:\n    await cleanup()', lost],
      [
        'match case returns',
        'match ready:\n    case 1:\n        return\n    case _:\n        raise',
        lost,
      ],
      [
        'match case falls through',
        'match ready:\n    case 1:\n        pass\n    case _:\n        raise',
        lost,
      ],
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
      ['loop then re-raise', handler('for task in ready:\n    task.cancel()\nraise'), []],
      ['loop break then re-raise', handler('while ready:\n    break\nraise'), []],
      ['loop continue then re-raise', handler('for task in ready:\n    continue\nraise'), []],
      [
        'match with a catch-all re-raises',
        handler('match ready:\n    case 1:\n        raise\n    case _:\n        raise error'),
        [],
      ],
      [
        'match without a catch-all is not proof of a lost path',
        handler('match ready:\n    case 1:\n        raise\n    case 2:\n        raise error'),
        [],
      ],
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
        ['cancellation-not-propagated:5 except cancelled()'],
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

  it('keeps nested exception dispatch outside the path model', () => {
    expect(
      single(handler('try:\n    cleanup()\nexcept ValueError:\n    recover(error)\nraise')),
    ).toEqual([]);
  });

  it('reports a handler that ends the loop it runs in', () => {
    const source = [
      'import asyncio',
      'async def run(queue):',
      '    while True:',
      '        try:',
      '            await queue.get()',
      '        except asyncio.CancelledError:',
      '            break',
      '',
    ].join('\n');

    expect(single(source)).toEqual([
      'cancellation-not-propagated src/mod.py:6 except asyncio.CancelledError',
    ]);
    expect(single(source.replace('break', 'continue'))).toEqual([
      'cancellation-not-propagated src/mod.py:6 except asyncio.CancelledError',
    ]);
  });

  it('accepts awaiting a task this function cancelled and reports other awaits', () => {
    const awaiting = (cancel, awaited, extra = '') =>
      [
        'import asyncio',
        'async def stop(task, other):',
        ...(cancel ? [`    ${cancel}`] : []),
        '    try:',
        `        ${extra}await ${awaited}`,
        '    except asyncio.CancelledError:',
        '        pass',
        '',
      ].join('\n');
    const reported = (line) => [
      `cancellation-not-propagated src/mod.py:${String(line)} except asyncio.CancelledError`,
    ];

    expect(single(awaiting('task.cancel()', 'task'))).toEqual([]);
    expect(single(awaiting('task.cancel()', 'task', 'result = '))).toEqual([]);
    expect(single(awaiting('', 'task'))).toEqual(reported(5));
    expect(single(awaiting('other.cancel()', 'task'))).toEqual(reported(6));
    expect(single(awaiting('task.cancel()', 'task.result()'))).toEqual(reported(6));
    const trio = awaiting('task.cancel()', 'task')
      .replace('import asyncio', 'import trio')
      .replace('asyncio.CancelledError', 'trio.Cancelled');
    expect(single(trio)).toEqual([
      'cancellation-not-propagated src/mod.py:6 except trio.Cancelled',
    ]);
  });

  it('keeps analysing the statements after an unknown construct', () => {
    const cases = [
      [
        'return after nested try',
        'try:\n    cleanup()\nexcept ValueError:\n    recover(error)\nreturn',
        lost,
      ],
      [
        'different error after nested try',
        'try:\n    cleanup()\nexcept ValueError:\n    recover(error)\nraise ValueError()',
        lost,
      ],
      ['return after a with that may suppress', 'with guard():\n    raise\nreturn', lost],
      [
        'return after match without a catch-all',
        'match ready:\n    case 1:\n        raise\nreturn',
        lost,
      ],
      [
        're-raise after nested try',
        'try:\n    cleanup()\nexcept ValueError:\n    recover(error)\nraise',
        [],
      ],
      ['re-raise after a with', 'with guard():\n    cleanup()\nraise', []],
      [
        'nested try alone is unknown',
        'try:\n    cleanup()\nexcept ValueError:\n    recover(error)',
        [],
      ],
      [
        're-raise after finally that may suppress',
        'try:\n    cleanup()\nfinally:\n    pass\nraise',
        [],
      ],
    ].map(([name, body, expected]) => [name, handler(body), expected]);
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('exempts only quiet handlers whose try only awaits tasks cancelled before it', () => {
    const source = (
      before,
      tried,
      caught,
      body,
      defined = 'async def stop(self, task, tasks, other):',
    ) =>
      [
        'import asyncio',
        defined,
        ...before.map((line) => `    ${line}`),
        '    try:',
        ...tried.map((line) => `        ${line}`),
        `    except ${caught}:`,
        `        ${body}`,
        '',
      ].join('\n');
    const at = (
      line,
      rule = 'cancellation-not-propagated',
      subject = 'except asyncio.CancelledError',
    ) => [`${rule} src/mod.py:${String(line)} ${subject}`];
    const cancel = ['task.cancel()'];
    const wait = ['await task'];
    const cancelled = 'asyncio.CancelledError';

    expect(single(source(cancel, wait, cancelled, 'pass'))).toEqual([]);
    expect(single(source(cancel, wait, cancelled, 'return'))).toEqual([]);
    expect(single(source(cancel, wait, cancelled, 'logger.info("stopped")'))).toEqual([]);
    expect(
      single(source(['self._task.cancel()'], ['await self._task'], cancelled, 'pass')),
    ).toEqual([]);
    expect(
      single(
        source(
          ['for item in tasks:', '    item.cancel()'],
          ['await asyncio.gather(*tasks)'],
          cancelled,
          'pass',
        ),
      ),
    ).toEqual([]);
    expect(
      single(
        source(
          ['task.cancel()', 'other.cancel()'],
          ['await asyncio.gather(task, other)'],
          cancelled,
          'pass',
        ),
      ),
    ).toEqual([]);
    expect(single(source(cancel, wait, cancelled, 'return 5'))).toEqual(at(6));
    expect(single(source(cancel, wait, cancelled, 'raise RuntimeError()'))).toEqual(at(6));
    expect(single(source(cancel, wait, '(asyncio.CancelledError, Exception)', 'pass'))).toEqual(
      at(6, undefined, 'except (asyncio.CancelledError, Exception)'),
    );
    expect(single(source(['if other:', '    task.cancel()'], wait, cancelled, 'pass'))).toEqual(
      at(7),
    );
    expect(single(source(['task.cancel()', 'task = other'], wait, cancelled, 'pass'))).toEqual(
      at(7),
    );
    expect(
      single(
        source(['self._task.cancel()', 'self = other'], ['await self._task'], cancelled, 'pass'),
      ),
    ).toEqual(at(7));
    expect(single(source(cancel, ['await task', 'await other'], cancelled, 'pass'))).toEqual(at(7));
    expect(
      single(
        source(
          ['for item in tasks:', '    item.cancel()'],
          ['await asyncio.gather(*other)'],
          cancelled,
          'pass',
        ),
      ),
    ).toEqual(at(7));
  });

  it('checks only handlers inside coroutines', () => {
    const sync = (head) =>
      [
        'import asyncio',
        head,
        '    try:',
        '        fut.result()',
        '    except asyncio.CancelledError:',
        '        return',
        '',
      ].join('\n');

    expect(single(sync('def done(fut):'))).toEqual([
      'swallowed-exception src/mod.py:5 except asyncio.CancelledError',
    ]);
    expect(single(sync('async def done(fut):'))).toEqual([
      'cancellation-not-propagated src/mod.py:5 except asyncio.CancelledError',
    ]);
    expect(
      single(
        [
          'import asyncio',
          'async def run(fut):',
          '    def done():',
          '        try:',
          '            fut.result()',
          '        except asyncio.CancelledError:',
          '            return',
          '    return done',
          '',
        ].join('\n'),
      ),
    ).toEqual(['swallowed-exception src/mod.py:6 except asyncio.CancelledError']);
    expect(
      single(
        [
          'import asyncio',
          'try:',
          '    pass',
          'except* asyncio.CancelledError:',
          '    pass',
          '',
        ].join('\n'),
      ),
    ).toEqual(['swallowed-exception src/mod.py:4 except asyncio.CancelledError']);
  });

  it('applies the same rule to contextlib.suppress in coroutines', () => {
    const suppress = (
      call,
      body = 'await operation()',
      before = '',
      imports = 'import asyncio\nimport contextlib',
    ) =>
      [
        imports,
        'async def run(operation, task):',
        ...(before ? [`    ${before}`] : []),
        `    with ${call}:`,
        `        ${body}`,
        '',
      ].join('\n');
    const at = (line, subject) => [
      `cancellation-not-propagated src/mod.py:${String(line)} ${subject}`,
    ];

    expect(single(suppress('contextlib.suppress(asyncio.CancelledError)'))).toEqual(
      at(4, 'suppress(asyncio.CancelledError)'),
    );
    expect(
      single(
        suppress(
          'suppress(Cancelled, ValueError)',
          'await operation()',
          '',
          'from contextlib import suppress\nfrom asyncio import CancelledError as Cancelled',
        ),
      ),
    ).toEqual(at(4, 'suppress(Cancelled, ValueError)'));
    expect(
      single(
        suppress('contextlib.suppress(asyncio.CancelledError)', 'await task', 'task.cancel()'),
      ),
    ).toEqual([]);
    expect(
      single(
        suppress(
          'contextlib.suppress(asyncio.CancelledError, ValueError)',
          'await task',
          'task.cancel()',
        ),
      ),
    ).toEqual(at(5, 'suppress(asyncio.CancelledError, ValueError)'));
    expect(single(suppress('contextlib.suppress(ValueError)'))).toEqual([]);
    expect(
      single(
        suppress(
          'contextlib.suppress(other.CancelledError)',
          'await operation()',
          '',
          'import contextlib\nimport other',
        ),
      ),
    ).toEqual([]);
    expect(
      single(
        'import asyncio\nimport contextlib\ndef run(operation):\n    with contextlib.suppress(asyncio.CancelledError):\n        operation()\n',
      ),
    ).toEqual([]);
  });

  it('resolves stored aliases and keeps comprehension targets out of rebinding', () => {
    const alias = (header, caught) =>
      [
        `import asyncio\nimport anyio\n${header}`,
        'async def run(operation):',
        '    try:',
        '        await operation()',
        `    except ${caught}:`,
        '        return',
        '',
      ].join('\n');

    expect(single(alias('E = asyncio.CancelledError', 'E'))).toEqual([
      'cancellation-not-propagated src/mod.py:7 except E',
    ]);
    expect(single(alias('cancelled = anyio.get_cancelled_exc_class()', 'cancelled'))).toEqual([
      'cancellation-not-propagated src/mod.py:7 except cancelled',
    ]);
    expect(single(alias('E = other.Error', 'E'))).toEqual([
      'swallowed-exception src/mod.py:7 except E',
    ]);
    expect(single(handler('values = [error for error in ready]\nraise error'))).toEqual([]);
    expect(single(handler('values = [(error := item) for item in ready]\nraise error'))).toEqual([
      'cancellation-not-propagated src/mod.py:5 except asyncio.CancelledError',
    ]);
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
    ).toEqual({ ok: true, messages: [messageFor('worker.py')] });
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
    expect(before[0].message).toBe(messageFor('src/worker.py'));
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
      new URL('../../fixtures/cancellation/banned/worker.py', import.meta.url),
      'utf8',
    );
    const allowed = readFileSync(
      new URL('../../fixtures/cancellation/allowed/worker.py', import.meta.url),
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
