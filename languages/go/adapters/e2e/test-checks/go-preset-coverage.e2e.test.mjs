import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  createWorkspace,
  gate,
  goRepository,
  newFindings,
  newMessages,
  removeWorkspace,
  toolErrors,
} from './test-support/go-e2e-support.mjs';
import {
  BASE_FILES,
  BRANCHY,
  DISCOUNT,
  DISCOUNT_HALF_TEST,
  DISCOUNT_PANIC_TEST,
  DISCOUNT_TEST,
  UNTESTED_LEGACY,
} from './test-support/go-fixtures.mjs';

const goE2eEnabled = process.env.NITPICKER_GO_E2E === '1';
const EXCEPTION = {
  rule: 'changed-branch-coverage',
  paths: ['shop/discount.go'],
  function: 'Discount',
  reason: 'fixture',
};

describe.skipIf(!goE2eEnabled)('Go preset coverage and CRAP end to end', () => {
  let workspace;
  let project;
  beforeAll(() => {
    workspace = createWorkspace();
    project = goRepository(workspace, { ...BASE_FILES, 'shop/fee.go': UNTESTED_LEGACY });
    commitBranch(project, 'half-tested', {
      'shop/discount.go': DISCOUNT,
      'shop/discount_test.go': DISCOUNT_HALF_TEST,
    });
    commitBranch(project, 'tested', {
      'shop/discount.go': DISCOUNT,
      'shop/discount_test.go': DISCOUNT_TEST,
    });
    commitBranch(project, 'excepted', {
      'shop/discount.go': DISCOUNT,
      'shop/discount_test.go': DISCOUNT_HALF_TEST,
      'nitpicker.config.json': JSON.stringify({ preset: 'go', exceptions: [EXCEPTION] }),
    });
    commitBranch(project, 'branchy', { 'shop/size.go': BRANCHY });
    commitBranch(project, 'panicking', {
      'shop/discount.go': DISCOUNT,
      'shop/discount_test.go': DISCOUNT_PANIC_TEST,
    });
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });

  it('fails a changed branch whose outcome no test takes, naming the outcome', () => {
    const result = gate(project, 'half-tested');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual(['coverage/changed-branch-coverage shop/discount.go']);
    expect(newMessages(result)).toEqual([
      'Branch coverage is 50.00%; minimum is 95%. Not taken: the if body (line 4). Test it, or remove it if it can\'t happen. If this is intended, add {"rule":"changed-branch-coverage","paths":["shop/discount.go"],"function":"Discount","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
    expect(result.exitCode).toBe(1);
  });

  it('passes fully tested code next to an untested legacy function', () => {
    const result = gate(project, 'tested');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('lifts a branch finding with a per-function exception the change must get accepted', () => {
    expect(newFindings(gate(project, 'excepted'))).toEqual([
      'nitpicker-config/policy-loosened nitpicker.config.json',
    ]);
  });

  it('fails an untested branchy function on its CRAP score and on each branch', () => {
    const result = gate(project, 'branchy');
    expect(newFindings(result)).toEqual([
      'coverage/changed-branch-coverage shop/size.go',
      'crap/crap-score-limit shop/size.go',
    ]);
    expect(newMessages(result)).toEqual([
      'Branch coverage is 0.00%; minimum is 95%. Not taken: case weight > 100 (line 5); case weight > 50 (line 7); case weight > 10 (line 9); case weight > 0 (line 11); no case matching. Test it, or remove it if it can\'t happen. If this is intended, add {"rule":"changed-branch-coverage","paths":["shop/size.go"],"function":"Size","reason":"..."} to "exceptions" in nitpicker.config.json.',
      'Size has CRAP 30.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function. If this is intended, add {"rule":"crap-score-limit","paths":["shop/size.go"],"function":"Size","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('measures no coverage in a package whose test binary crashed, since it wrote no profile', () => {
    const result = gate(project, 'panicking');
    expect(toolErrors(result)).toEqual(['tests/tests-failed .']);
    expect(newFindings(result)).toEqual([]);
  });
});
