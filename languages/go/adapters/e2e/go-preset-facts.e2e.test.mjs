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
import { FACT_FILES, PRINTING_FILES, RESTATING_FILES } from './test-support/go-fact-fixtures.mjs';

const goE2eEnabled = process.env.NITPICKER_GO_E2E === '1';

describe.skipIf(!goE2eEnabled)('Go preset doc comments and test output end to end', () => {
  let workspace;
  let repository;
  beforeAll(() => {
    workspace = createWorkspace();
    repository = goRepository(workspace, FACT_FILES);
    commitBranch(repository, 'restating', RESTATING_FILES);
    commitBranch(repository, 'printing', PRINTING_FILES);
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });

  it('fails a doc comment that only restates its name', () => {
    const result = gate(repository, 'restating');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual(['facts/doc-comment-content internal/cart/cart.go']);
  });

  it('fails a new standard log line a test prints, not a plain print', () => {
    const result = gate(repository, 'printing');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual([
      'test-runtime/test-console-output internal/cart/cart_test.go',
    ]);
    expect(newMessages(result).map((message) => /"([^"]*)"/u.exec(message)[1])).toEqual([
      'price list has <n> entries',
    ]);
  });
});
