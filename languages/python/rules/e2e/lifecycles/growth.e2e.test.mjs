import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['io-in-loop', 'frozen-dataclass'] });
afterEach(cleanup);

const RULE = 'unbounded-collection';
const found = (line, subject) => [`${RULE}:${String(line)} ${subject}`];
const CLOSE = '    def close(self):\n        pass';
const klass = (init, methods) =>
  `class Sessions:\n    def __init__(self):\n        ${init}\n\n${methods}\n\n${CLOSE}\n`;

describe.skipIf(!enabled)('unbounded-collection', () => {
  it('reports a long-lived collection that is only added to', () => {
    const cases = [
      [
        'dict keyed by session',
        klass(
          'self._sessions = {}',
          '    def open(self, key, value):\n        self._sessions[key] = value',
        ),
        found(3, 'Sessions._sessions: grows in open'),
      ],
      [
        'set of seen tokens',
        klass('self._seen = set()', '    def seen(self, token):\n        self._seen.add(token)'),
        found(3, 'Sessions._seen: grows in seen'),
      ],
      [
        'list of events',
        klass('self._events = []', '    def log(self, event):\n        self._events.append(event)'),
        found(3, 'Sessions._events: grows in log'),
      ],
      [
        'dataclass field',
        'from dataclasses import dataclass, field\n\n\n@dataclass\nclass Tracker:\n    runs: dict = field(default_factory=dict)\n\n    def add(self, key, run):\n        self.runs[key] = run\n\n    def close(self):\n        pass\n',
        found(6, 'Tracker.runs: grows in add'),
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('accepts registries, removal, bounds and replacement', () => {
    const cases = [
      [
        'removed when the session ends',
        klass(
          'self._sessions = {}',
          '    def open(self, key, value):\n        self._sessions[key] = value\n\n    def end(self, key):\n        del self._sessions[key]',
        ),
        [],
      ],
      [
        'popped',
        klass(
          'self._sessions = {}',
          '    def open(self, key, value):\n        self._sessions[key] = value\n\n    def end(self, key):\n        self._sessions.pop(key, None)',
        ),
        [],
      ],
      [
        'size checked before the add',
        klass(
          'self._cache = {}',
          '    def put(self, key, value):\n        if len(self._cache) >= 100:\n            self._cache.clear()\n        self._cache[key] = value',
        ),
        [],
      ],
      [
        'registry method',
        klass(
          'self._handlers = {}',
          '    def register(self, name, handler):\n        self._handlers[name] = handler',
        ),
        [],
      ],
      [
        'literal key',
        klass('self._state = {}', '    def start(self):\n        self._state["started"] = True'),
        [],
      ],
      [
        'swapped out by a tuple assignment',
        klass(
          'self._events = []',
          '    def log(self, event):\n        self._events.append(event)\n\n    def drain(self):\n        out, self._events = self._events, []\n        return out',
        ),
        [],
      ],
      [
        'removed through an alias',
        klass(
          'self._sessions = {}',
          '    def open(self, key, value):\n        self._sessions[key] = value\n\n    def drop(self, key):\n        sessions = self._sessions\n        sessions.pop(key)',
        ),
        [],
      ],
      [
        'replaced by a new list',
        klass(
          'self._events = []',
          '    def log(self, event):\n        self._events.append(event)\n\n    def flush(self):\n        self._events = []',
        ),
        [],
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });
});
