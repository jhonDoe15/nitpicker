import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['io-in-loop'] });
afterEach(cleanup);

const RULE = 'handle-unreleased-on-close';
const found = (line, subject) => [`${RULE}:${String(line)} ${subject}`];
const HEAD =
  'import signal\nimport threading\n\n\nclass Poller:\n    def __init__(self, loop):\n        self._loop = loop\n        self._handle = None\n\n';
const start = (body) => `${HEAD}    def start(self):\n        ${body}\n`;
const closeWith = (body) => `\n    def close(self):\n        ${body}\n`;

describe.skipIf(!enabled)('handle-unreleased-on-close', () => {
  it('reports timers and signal handlers that close never releases', () => {
    const call = 'self._handle = self._loop.call_later(5, self.tick)';
    const cases = [
      [
        'kept but not cancelled',
        start(call) + closeWith('pass'),
        found(11, 'Poller.start: call_later'),
      ],
      [
        'dropped handle',
        start('self._loop.call_later(5, self.tick)') + closeWith('self._handle.cancel()'),
        found(11, 'Poller.start: call_later'),
      ],
      [
        'signal handler',
        start('self._loop.add_signal_handler(signal.SIGTERM, self.close)') + closeWith('pass'),
        found(11, 'Poller.start: add_signal_handler'),
      ],
      [
        'thread timer',
        start('self._handle = threading.Timer(5, self.tick)') + closeWith('pass'),
        found(11, 'Poller.start: Timer'),
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('accepts handles that close cancels, directly or through a helper', () => {
    const call = 'self._handle = self._loop.call_later(5, self.tick)';
    const cases = [
      ['cancelled in close', start(call) + closeWith('self._handle.cancel()'), []],
      [
        'cancelled in a helper',
        `${start(call)}${closeWith('self._release()')}\n    def _release(self):\n        self._handle.cancel()\n`,
        [],
      ],
      [
        'signal handler removed',
        start('self._loop.add_signal_handler(signal.SIGTERM, self.close)') +
          closeWith('self._loop.remove_signal_handler(signal.SIGTERM)'),
        [],
      ],
      ['fire-once call_soon', start('self._loop.call_soon(self.tick)') + closeWith('pass'), []],
      [
        'cancelled in the same method',
        start('h = self._loop.call_later(5, self.tick)\n        h.cancel()') + closeWith('pass'),
        [],
      ],
      [
        'stored in a collection that close cancels',
        `${start('self._all.append(self._loop.call_later(5, self.tick))')}${closeWith('for h in self._all:\n            h.cancel()')}`,
        [],
      ],
      [
        'alias cancelled in close',
        start(call) + closeWith('h = self._handle\n        h.cancel()'),
        [],
      ],
      ['handed to a helper in close', start(call) + closeWith('cancel_all(self._handle)'), []],
      [
        'local timer started and joined',
        start('t = threading.Timer(5, self.tick)\n        t.start()\n        t.join()') +
          closeWith('pass'),
        [],
      ],
      ['a class without a close function', start(call), []],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });
});
