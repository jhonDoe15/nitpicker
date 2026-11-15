import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  createWorkspace,
  gate,
  goRepository,
  removeWorkspace,
  toolErrors,
} from '../test-support/go-e2e-support.mts';
import type { GateResult } from '../test-support/go-e2e-support.mts';
import { BASE_FILES } from '../test-support/go-fixtures.mts';

const goE2eEnabled = process.env['NITPICKER_GO_E2E'] === '1';

const fee = (condition: string) => `package shop

func Fee(weight int) int {
	${condition}
		return 5
	}
	return 1
}
`;

const cleanup = (call: string) => `package shop

import "os"

func Clean(path string) {
	${call}
}
`;

function newLines(result: GateResult, rule: string) {
  return result
    .findings('new-findings.json')
    .filter((finding) => finding.classification === 'enforceable' && finding.rule === rule)
    .map(({ path, location }) => `${path}:${String(location.line)}`);
}

describe.skipIf(!goE2eEnabled)('Go findings on lines gofmt only re-spaced', () => {
  let workspace: string;
  let project: string;
  beforeAll(() => {
    workspace = createWorkspace();
    project = goRepository(workspace, {
      ...BASE_FILES,
      'shop/fee.go': fee('if(weight>10){'),
      'shop/cleanup.go': cleanup('os.Remove( path )'),
    });
    commitBranch(project, 'reformatted', {
      'shop/fee.go': fee('if (weight > 10) {'),
      'shop/cleanup.go': cleanup('os.Remove(path)'),
    });
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });

  it('keeps legacy findings baselined when gofmt only re-spaces their lines', () => {
    const result = gate(project, 'reformatted');
    expect(toolErrors(result)).toEqual([]);
    expect(newLines(result, 'changed-branch-coverage')).toEqual([]);
    expect(newLines(result, 'errcheck/unchecked')).toEqual([]);
  });
});
