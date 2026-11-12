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
  APP_FILES,
  MAIN_WITH_REFUND,
  REBATE,
  REBATE_TEST,
  REFUND,
  ROUNDING,
  ROUNDING_TEST,
} from './test-support/go-app-fixtures.mjs';

const goE2eEnabled = process.env.NITPICKER_GO_E2E === '1';

describe.skipIf(!goE2eEnabled)('Go preset duplicates and dead code end to end', () => {
  let workspace;
  let project;
  beforeAll(() => {
    workspace = createWorkspace();
    project = goRepository(workspace, APP_FILES);
    commitBranch(project, 'copied', {
      'internal/billing/refund.go': REFUND,
      'cmd/shop/main.go': MAIN_WITH_REFUND,
    });
    commitBranch(project, 'test-only', {
      'internal/billing/rebate.go': REBATE,
      'internal/billing/rebate_test.go': REBATE_TEST,
    });
    commitBranch(project, 'unused', { 'internal/billing/rounding.go': ROUNDING });
    commitBranch(project, 'unreachable', {
      'internal/billing/rounding.go': ROUNDING,
      'internal/billing/rounding_test.go': ROUNDING_TEST,
    });
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });

  it.each([
    [
      'a renamed copy of a function',
      'copied',
      'duplicates/duplicate-clone internal/billing/invoice.go',
    ],
    [
      'an exported function only tests call, once',
      'test-only',
      'facts/test-only-export internal/billing/rebate.go',
    ],
    [
      'a function nothing calls once, as staticcheck U1000',
      'unused',
      'staticcheck/U1000 internal/billing/rounding.go',
    ],
  ])('fails %s', (_case, branch, finding) => {
    const result = gate(project, branch);
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual([finding]);
  });

  it('fails a function only tests call, which no main package reaches', () => {
    const result = gate(project, 'unreachable');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual(['deadcode/unreachable-func internal/billing/rounding.go']);
    expect(newMessages(result)).toEqual([
      'round is never reached from a main package of this module (deadcode; calls from tests do not count). Delete it, or call it from production code. If this is intended, add {"rule":"deadcode/unreachable-func","paths":["internal/billing/rounding.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });
});
