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
];
