import {
  CLOSED_FILES,
  REPEATED_STEPS_FILES,
  TWO_CALLERS_FILES,
  UNCLOSED_FILES,
} from './calls-fixtures.mjs';
import {
  COPYING_FILES,
  ESCAPING_FILES,
  THREADING_FILES,
  WIDE_THREADING_FILES,
} from './state-fixtures.mjs';

export const SCENARIOS = [
  {
    branch: 'escaping',
    title: 'fails a caller in another package that changes the slice a method returned',
    files: ESCAPING_FILES,
    expected: ['mutable-state-escape internal/checkout/pay.go enforceable'],
  },
  {
    branch: 'copying',
    title: 'passes a caller that changes a copy and one that only appends',
    files: COPYING_FILES,
    expected: [],
  },
  {
    branch: 'threading',
    title: 'reports a context passed whole through callables that read two of its six fields',
    files: THREADING_FILES,
    expected: ['context-threading internal/orders/place.go descriptive'],
  },
  {
    branch: 'wide-threading',
    title: 'passes a context whose callables read half of its fields',
    files: WIDE_THREADING_FILES,
    expected: [],
  },
  {
    branch: 'unclosed-session',
    title: 'fails a session that is opened and not closed on every exit',
    files: UNCLOSED_FILES,
    expected: ['protocol-contract internal/app/save.go enforceable'],
  },
  {
    branch: 'closed-session',
    title: 'passes a session whose rollback is deferred',
    files: CLOSED_FILES,
    expected: [],
  },
  {
    branch: 'repeated-steps',
    title: 'reports the same three steps repeated by three callers in two packages',
    files: REPEATED_STEPS_FILES,
    expected: ['caller-protocol internal/db/session.go descriptive'],
  },
  {
    branch: 'two-callers',
    title: 'passes the same steps in only two callers',
    files: TWO_CALLERS_FILES,
    expected: [],
  },
];
