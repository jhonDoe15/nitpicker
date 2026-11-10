import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  createWorkspace,
  gate,
  goRepository,
  newFindings,
  removeWorkspace,
  toolErrors,
} from './test-support/go-e2e-support.mjs';
import { BILLING_EDITED, COPIED_FILES, REUSE_FILES } from './test-support/go-reuse-fixtures.mjs';

const goE2eEnabled = process.env.NITPICKER_GO_E2E === '1';

describe.skipIf(!goE2eEnabled)('Go preset copies across packages end to end', () => {
  let workspace;
  let single;
  let copied;
  beforeAll(() => {
    workspace = createWorkspace();
    single = goRepository(workspace, REUSE_FILES);
    commitBranch(single, 'copied', COPIED_FILES);
    copied = goRepository(workspace, { ...REUSE_FILES, ...COPIED_FILES });
    commitBranch(copied, 'drifted', { 'internal/billing/total.go': BILLING_EDITED });
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });

  it('fails a small function copied into another package', () => {
    const result = gate(single, 'copied');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual([
      'facts/duplicate-definition internal/billing/total.go',
      'facts/duplicate-definition internal/report/score.go',
    ]);
  });

  it('fails a copy edited away from its unedited sibling', () => {
    const result = gate(copied, 'drifted');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual(['facts/sibling-copy-edit internal/billing/total.go']);
  });
});
