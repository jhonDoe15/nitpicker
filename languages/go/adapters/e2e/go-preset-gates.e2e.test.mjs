import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  createWorkspace,
  gate,
  goRepository,
  newFindings,
  newMessages,
  removeWorkspace,
  toolErrorMessages,
  toolErrors,
} from './test-support/go-e2e-support.mjs';
import {
  BASE_FILES,
  BROKEN,
  DISCOUNT,
  DISCOUNT_TEST,
  FAILING_TEST,
  LEGACY_TOUCHED,
  NESTED,
  PRINTF,
  UNFORMATTED,
} from './test-support/go-fixtures.mjs';

const goE2eEnabled = process.env.NITPICKER_GO_E2E === '1';
const EXCEPTING_CONFIG = JSON.stringify({
  preset: 'go',
  exceptions: [
    { rule: 'vet/printf', paths: ['shop/label.go'], reason: 'fixture' },
    {
      rule: 'function-control-nesting-limit',
      paths: ['shop/grade.go'],
      function: 'Grade',
      reason: 'fixture',
    },
  ],
});

describe.skipIf(!goE2eEnabled)('Go preset gates end to end', () => {
  let workspace;
  let project;
  beforeAll(() => {
    workspace = createWorkspace();
    project = goRepository(workspace, BASE_FILES);
    commitBranch(project, 'clean', {
      'shop/discount.go': DISCOUNT,
      'shop/discount_test.go': DISCOUNT_TEST,
    });
    commitBranch(project, 'unformatted', { 'shop/shipping.go': UNFORMATTED });
    commitBranch(project, 'printf', { 'shop/label.go': PRINTF });
    commitBranch(project, 'broken', { 'shop/broken.go': BROKEN });
    commitBranch(project, 'nested', { 'shop/grade.go': NESTED, 'shop/legacy.go': LEGACY_TOUCHED });
    commitBranch(project, 'excepted', {
      'shop/label.go': PRINTF,
      'shop/grade.go': NESTED,
      'nitpicker.config.json': EXCEPTING_CONFIG,
    });
    commitBranch(project, 'failing', { 'shop/broken_test.go': FAILING_TEST });
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });

  it('passes a change that adds tested, formatted code', () => {
    const result = gate(project, 'clean');
    expect(toolErrors(result)).toEqual([]);
    expect(newFindings(result)).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('fails a file gofmt would change, naming the fix', () => {
    const result = gate(project, 'unformatted');
    expect(newFindings(result)).toEqual(['gofmt/format shop/shipping.go']);
    expect(newMessages(result)).toEqual([
      'File is not formatted with gofmt. Run `gofmt -w` on it.',
    ]);
    expect(result.exitCode).toBe(1);
  });

  it('fails a go vet diagnostic with its exception route', () => {
    const result = gate(project, 'printf');
    expect(newFindings(result)).toEqual(['vet/printf shop/label.go']);
    expect(newMessages(result)).toEqual([
      'fmt.Sprintf format %s has arg count of wrong type int. If this is intended, add {"rule":"vet/printf","paths":["shop/label.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('fails code that does not compile, and does not blame the tests it stopped', () => {
    const result = gate(project, 'broken');
    expect(newFindings(result)).toEqual(['build/compile-error shop/broken.go']);
    expect(toolErrors(result)).toEqual([]);
  });

  it('fails new structure violations but not a legacy function the change did not make worse', () => {
    const result = gate(project, 'nested');
    expect(newFindings(result)).toEqual(['structure/function-control-nesting-limit shop/grade.go']);
    expect(newMessages(result)).toEqual([
      'Grade nests control flow 3 deep (limit 2). Return early instead of nesting. An else-if chain counts as one level; return early, use a switch, or move what nests inside a branch into a helper function. If this is intended, add {"rule":"function-control-nesting-limit","paths":["shop/grade.go"],"function":"Grade","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('lifts findings with top-level exceptions, which the change must get accepted', () => {
    expect(newFindings(gate(project, 'excepted'))).toEqual([
      'nitpicker-config/policy-loosened nitpicker.config.json',
      'nitpicker-config/policy-loosened nitpicker.config.json',
    ]);
  });

  it('reports failing tests as a tool error that quotes the failure', () => {
    const result = gate(project, 'failing');
    expect(toolErrors(result)).toEqual(['tests/tests-failed .']);
    expect(toolErrorMessages(result)).toEqual([
      [
        'Tests fail in the head snapshot. Make each failing test pass:',
        '  example.com/shop/shop.TestBroken',
        '    broken_test.go:6: still broken',
        'The static analyzers ran as usual; coverage comes from the tests that ran.',
      ].join('\n'),
    ]);
  });
});
