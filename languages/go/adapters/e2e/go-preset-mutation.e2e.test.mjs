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
  BROKEN_TEST,
  FEE,
  FEE_HALF_TEST,
  FEE_TEST,
  MUTATION_BASE,
  WEAKER_RATE_TEST,
} from './test-support/go-mutation-fixtures.mjs';

const goE2eEnabled = process.env.NITPICKER_GO_E2E === '1';

describe.skipIf(!goE2eEnabled)('Go preset mutation testing end to end', () => {
  let workspace;
  let project;
  beforeAll(() => {
    workspace = createWorkspace();
    project = goRepository(workspace, MUTATION_BASE);
    commitBranch(project, 'half-tested', {
      'shop/fee.go': FEE,
      'shop/fee_test.go': FEE_HALF_TEST,
    });
    commitBranch(project, 'tested', { 'shop/fee.go': FEE, 'shop/fee_test.go': FEE_TEST });
    commitBranch(project, 'weakened', { 'shop/rate_test.go': WEAKER_RATE_TEST });
    commitBranch(project, 'failing', {
      'shop/fee.go': FEE,
      'shop/fee_test.go': FEE_HALF_TEST,
      'shop/broken_test.go': BROKEN_TEST,
    });
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });

  it('fails a surviving mutant on a changed line, showing the replacement', () => {
    const result = gate(project, 'half-tested');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual(['mutation/mutant-survived shop/fee.go']);
    expect(newMessages(result)).toEqual([
      'Survived EqualityOperator at column 11: replacing `>` with `>=` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears. If this is intended, add {"rule":"mutant-survived","paths":["shop/fee.go"],"function":"Fee","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
    expect(result.exitCode).toBe(1);
  });

  it('passes changed code whose tests kill every mutant, next to untested legacy code', () => {
    const result = gate(project, 'tested');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('fails a mutant the base tests caught and the changed tests no longer do', () => {
    const result = gate(project, 'weakened');
    expect(toolErrors(result)).toEqual([]);
    expect(newMessages(result)).toEqual([
      'This change weakened the tests of shop/rate.go: the base tests caught this EqualityOperator mutant (`>` replaced with `>=`), but it survives now. Restore the assertion that caught it, or add one. If this is intended, add {"rule":"mutant-survived","paths":["shop/rate.go"],"function":"Rate","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('skips the mutants whose package tests fail on head, and says so', () => {
    const result = gate(project, 'failing');
    expect(toolErrors(result)).toEqual(['tests/tests-failed .']);
    expect(newFindings(result)).toEqual([]);
    expect(
      result
        .json('new-findings.json')
        .filter(({ rule }) => rule === 'mutation-skipped')
        .map(({ message }) => message),
    ).toEqual([
      'Mutation testing skipped 4 mutants: the tests of example.com/shop/shop fail. Fix the tests and rerun.',
    ]);
  });
});
