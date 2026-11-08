import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
  LABEL,
  LABEL_TEST,
  RACE_BASE_FILES,
  STOCK,
  STOCK_TEST,
} from './test-support/go-race-fixtures.mjs';

const goE2eEnabled = process.env.NITPICKER_GO_E2E === '1';

function raceFindings(result) {
  return result
    .json('new-findings.json')
    .filter(({ tool }) => tool === 'race')
    .map(({ rule, classification }) => `race/${rule} ${classification}`);
}

describe.skipIf(!goE2eEnabled)('Go preset race detector end to end', () => {
  let workspace;
  let project;
  beforeAll(() => {
    workspace = createWorkspace();
    project = goRepository(workspace, RACE_BASE_FILES);
    commitBranch(project, 'new-race', { 'shop/stock.go': STOCK, 'shop/stock_test.go': STOCK_TEST });
    commitBranch(project, 'other-change', {
      'shop/label.go': LABEL,
      'shop/label_test.go': LABEL_TEST,
    });
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails a change that adds a race a test exercises, naming both accesses', () => {
    const result = gate(project, 'new-race');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual(['race/data-race shop/stock.go']);
    expect(newMessages(result)).toEqual([
      'Data race: write in shop.(*Stock).Restock (shop/stock.go:5) and read in shop.(*Stock).Units (shop/stock.go:7) touch the same memory from two goroutines without synchronization, found by TestStock. Guard the shared value with a sync.Mutex, make it a sync/atomic value, or hand it over through a channel.',
    ]);
    expect(result.exitCode).toBe(1);
  });

  it('does not fail a change for a race the base already had', () => {
    const result = gate(project, 'other-change');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('says in the notices that races were not checked when cgo is off', () => {
    vi.stubEnv('CGO_ENABLED', '0');
    const result = gate(project, 'new-race');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual([]);
    expect(raceFindings(result)).toEqual([]);
    expect(result.json('summary.json').notices).toEqual([
      'race/race-not-checked: Data races were not checked: go test -race needs cgo, which is off (CGO_ENABLED=0, or Go found no C compiler). Enable cgo (CGO_ENABLED=1 with a C compiler such as gcc on the PATH) on a platform the race detector supports to run the tests with -race.',
    ]);
    expect(result.text.split('\n').filter((line) => line.includes('Notices'))).toEqual([
      'Notices (not failing):',
    ]);
    expect(result.exitCode).toBe(0);
  });
});
