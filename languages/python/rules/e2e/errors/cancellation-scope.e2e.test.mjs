import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';
import { handler, lost } from '../../test-support/cancellation-handlers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, single } = createScripts();
afterEach(cleanup);

describe.skipIf(!enabled)(
  'cancellation handlers around awaited tasks, coroutines and suppress',
  () => {
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
      expect(single(source(cancel, ['await task', 'await other'], cancelled, 'pass'))).toEqual(
        at(7),
      );
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
  },
);
