import {
  CLOSED_FILES,
  REPEATED_STEPS_FILES,
  TWO_CALLERS_FILES,
  UNCLOSED_FILES,
} from './calls-fixtures.mjs';
import {
  CLUMP_FILES,
  DIFFERENT_POLICY_FILES,
  DISJOINT_FILES,
  FORWARDING_FILES,
  NO_CLUMP_FILES,
  OWNING_HOP_FILES,
  POLICY_FILES,
  SHARED_CALLER_FILES,
} from './surface-fixtures.mjs';
import {
  COPYING_FILES,
  ESCAPING_FILES,
  THREADING_FILES,
  WIDE_THREADING_FILES,
} from './state-fixtures.mjs';

import { FOREIGN_DECISION_FILES, SINGLE_FIELD_FILES } from './reads-fixtures.mjs';

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
  {
    branch: 'forwarding-chain',
    title: 'reports two hops that pass the same parameters on and return the result unchanged',
    files: FORWARDING_FILES,
    expected: ['forwarding-chain internal/api/orders.go descriptive'],
  },
  {
    branch: 'owning-hop',
    title: 'passes a chain whose middle hop supplies one argument itself',
    files: OWNING_HOP_FILES,
    expected: [],
  },
  {
    branch: 'disjoint-groups',
    title: 'reports a struct whose methods serve two groups of callers that share nothing',
    files: DISJOINT_FILES,
    expected: ['disjoint-consumer-groups internal/ledger/ledger.go descriptive'],
  },
  {
    branch: 'shared-caller',
    title: 'passes a struct that one caller uses across both groups',
    files: SHARED_CALLER_FILES,
    expected: [],
  },
  {
    branch: 'data-clump',
    title: 'reports the same three typed parameters in three exported functions of three packages',
    files: CLUMP_FILES,
    expected: ['data-clump internal/cli/dial.go descriptive'],
  },
  {
    branch: 'no-clump',
    title: 'passes two functions that share parameters and a numeric coordinate kernel',
    files: NO_CLUMP_FILES,
    expected: [],
  },
  {
    branch: 'repeated-policy',
    title: 'reports two packages that group the constants of one enum the same way',
    files: POLICY_FILES,
    expected: ['repeated-policy-decision internal/pay/method.go descriptive'],
  },
  {
    branch: 'different-policy',
    title: 'passes two packages that group the constants differently',
    files: DIFFERENT_POLICY_FILES,
    expected: [],
  },
  {
    branch: 'foreign-decision',
    title: 'reports two packages that branch on the same two fields of a struct they do not own',
    files: FOREIGN_DECISION_FILES,
    expected: ['foreign-state-decision internal/ledger/account.go descriptive'],
  },
  {
    branch: 'single-field',
    title: 'passes two packages that each branch on one field of the struct',
    files: SINGLE_FIELD_FILES,
    expected: [],
  },
];
