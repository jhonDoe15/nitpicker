import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DESIGN_RULES } from '../../../../../shared/project-rules/design/design-rules.mjs';
import {
  commitBranch,
  createWorkspace,
  gate,
  goRepository,
  removeWorkspace,
  toolErrors,
} from '../test-support/go-e2e-support.mjs';
import { BASE_FILES, COPYING_FILES, ESCAPING_FILES } from './state-fixtures.mjs';

const goE2eEnabled = process.env.NITPICKER_GO_E2E === '1';

function designFindings(result) {
  return result
    .json('new-findings.json')
    .filter(({ rule }) => DESIGN_RULES.includes(rule))
    .map(({ rule, path, classification }) => `${rule} ${path} ${classification}`)
    .sort();
}

describe.skipIf(!goE2eEnabled)('Go preset design rules end to end', () => {
  let workspace;
  let repository;
  beforeAll(() => {
    workspace = createWorkspace();
    repository = goRepository(workspace, BASE_FILES);
    commitBranch(repository, 'escaping', ESCAPING_FILES);
    commitBranch(repository, 'copying', COPYING_FILES);
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });

  it('fails a caller in another package that changes the slice a method returned', () => {
    const result = gate(repository, 'escaping');
    expect(toolErrors(result)).toEqual([]);
    expect(designFindings(result)).toEqual([
      'mutable-state-escape internal/checkout/pay.go enforceable',
    ]);
  });

  it('passes a caller that changes a copy and one that only appends', () => {
    const result = gate(repository, 'copying');
    expect(toolErrors(result)).toEqual([]);
    expect(designFindings(result)).toEqual([]);
  });
});
