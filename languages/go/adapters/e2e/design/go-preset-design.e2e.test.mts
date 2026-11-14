import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DESIGN_RULES } from '../../../../../shared/project-rules/design/design-rules.mjs';
import {
  commitBranch,
  createWorkspace,
  gate,
  goRepository,
  removeWorkspace,
  toolErrors,
} from '../test-support/go-e2e-support.mts';
import type { GateResult } from '../test-support/go-e2e-support.mts';
import { BASE_FILES } from './test-support/base-fixtures.mts';
import { SCENARIOS } from './test-support/scenarios.mts';

const goE2eEnabled = process.env['NITPICKER_GO_E2E'] === '1';

function designFindings(result: GateResult) {
  return result
    .findings('new-findings.json')
    .filter(({ rule }) => DESIGN_RULES.includes(rule))
    .map(({ rule, path, classification }) => `${rule} ${path} ${classification}`)
    .sort();
}

describe.skipIf(!goE2eEnabled)('Go preset design rules end to end', () => {
  let workspace: string;
  let repository: string;
  beforeAll(() => {
    workspace = createWorkspace();
    repository = goRepository(workspace, BASE_FILES);
    for (const { branch, files } of SCENARIOS) {
      commitBranch(repository, branch, files);
    }
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });

  it.each(SCENARIOS)('$title', ({ branch, expected }) => {
    const result = gate(repository, branch);
    expect(toolErrors(result)).toEqual([]);
    expect(designFindings(result)).toEqual(expected);
  });
});
