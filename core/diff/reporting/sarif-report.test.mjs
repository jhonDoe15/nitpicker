import { describe, expect, it } from 'vitest';
import {
  renderBaselineSarifReport,
  renderSarifReport,
  renderSnapshotSarifReport,
} from './sarif.mjs';
import { expectValidSarif } from './test-support/report-assertions.mjs';
import { sarifSchemaErrors } from './test-support/sarif-schema.mjs';
import { finding, report } from './test-support/report-builders.mjs';

const projectPath = 'packages/my app';

function held(overrides = {}) {
  return finding({
    rule: 'file-size',
    identity: 'size',
    ratchet: { key: 'size', value: 7 },
    heldAtBase: 7,
    ...overrides,
  });
}

function comparison() {
  return {
    ...report({
      newFindings: [finding()],
      unchangedFindings: [held(), finding({ rule: 'untouched', identity: 'u' })],
    }),
    resolvedFindings: [finding({ rule: 'fixed', identity: 'f' })],
  };
}

function states(log) {
  return log.runs[0].results.map((result) => [result.ruleId, result.baselineState]);
}

describe('renderSarifReport', () => {
  it('emits a structurally valid SARIF 2.1.0 log with fingerprints', () => {
    const log = JSON.parse(
      renderSarifReport(
        report({
          newFindings: [
            finding(),
            finding({ rule: 'no-var', identity: 'b:2', location: undefined }),
            finding({
              tool: 'complexity',
              rule: 'cyclomatic',
              identity: 'fn',
              classification: 'descriptive',
              metric: { name: 'cyclomatic', value: 9 },
            }),
          ],
          toolErrors: [{ tool: 'depcruise', snapshot: 'head', message: 'boom' }],
        }),
        { projectPath: '' },
      ),
    );

    expectValidSarif(log);
    const [run] = log.runs;
    expect(run.columnKind).toBe('utf16CodeUnits');
    expect(run.originalUriBaseIds).toBeUndefined();
    expect(run.results.map((result) => [result.ruleId, result.level])).toEqual([
      ['eslint/no-console', 'error'],
      ['eslint/no-var', 'error'],
      ['complexity/cyclomatic', 'note'],
    ]);
    expect(run.results[0].locations[0].physicalLocation).toEqual({
      artifactLocation: { uri: 'src/a.js', uriBaseId: '%SRCROOT%' },
      region: { startLine: 12, startColumn: 3 },
    });
    expect(run.results[1].locations[0].physicalLocation.region).toBeUndefined();
    expect(run.invocations[0]).toEqual({
      executionSuccessful: false,
      toolExecutionNotifications: [{ level: 'error', message: { text: 'depcruise (head): boom' } }],
    });
  });
  it('keeps fingerprints stable across line moves and distinct across findings', () => {
    const fingerprint = (value) =>
      JSON.parse(renderSarifReport(report({ newFindings: [value] }), { projectPath })).runs[0]
        .results[0].partialFingerprints['nitpickerIdentity/v1'];

    const original = fingerprint(finding());
    expect(original).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(finding({ location: { line: 99 }, message: 'reworded' }))).toBe(original);
    expect(fingerprint(finding({ identity: 'other' }))).not.toBe(original);
    expect(fingerprint(finding({ path: 'src/b.js' }))).not.toBe(original);
  });
  it('emits an empty result list for a clean report', () => {
    const log = JSON.parse(renderSarifReport(report(), { projectPath }));
    expectValidSarif(log);
    expect(log.runs[0].results).toEqual([]);
    expect(log.runs[0].invocations[0].executionSuccessful).toBe(true);
  });
  it('writes only the new findings, so an upload never turns held findings into alerts', () => {
    const log = JSON.parse(renderSarifReport(comparison(), { projectPath }));

    expectValidSarif(log);
    expect(states(log)).toEqual([['eslint/no-console', 'new']]);
  });
  it('prefixes paths with the project folder so they are relative to the repository root', () => {
    const log = JSON.parse(
      renderSarifReport(report({ newFindings: [finding({ path: 'src/[id]/my page#1.ts' })] }), {
        projectPath: 'packages/my app/',
      }),
    );

    expectValidSarif(log);
    expect(log.runs[0].results[0].locations[0].physicalLocation.artifactLocation).toEqual({
      uri: 'packages/my%20app/src/%5Bid%5D/my%20page%231.ts',
      uriBaseId: '%SRCROOT%',
    });
  });
  it('keeps project-relative paths without a base id when the repository folder is unknown', () => {
    const log = JSON.parse(renderSarifReport(report({ newFindings: [finding()] })));

    expectValidSarif(log);
    expect(log.runs[0].results[0].locations[0].physicalLocation.artifactLocation).toEqual({
      uri: 'src/a.js',
    });
  });
  it('points a finding about the whole project at the project folder', () => {
    const locationIn = (options) =>
      JSON.parse(renderSarifReport(report({ newFindings: [finding({ path: '' })] }), options))
        .runs[0].results[0].locations[0].physicalLocation.artifactLocation;

    expect([
      locationIn({ projectPath: 'packages/my app/' }),
      locationIn({ projectPath: '' }),
      locationIn(undefined),
    ]).toEqual([
      { uri: 'packages/my%20app', uriBaseId: '%SRCROOT%' },
      { uri: '.', uriBaseId: '%SRCROOT%' },
      { uri: '.' },
    ]);
  });
});

describe('renderBaselineSarifReport', () => {
  it('marks new findings new and held findings unchanged, and leaves out fixed ones', () => {
    const log = JSON.parse(renderBaselineSarifReport(comparison(), { projectPath }));

    expectValidSarif(log);
    expect(states(log)).toEqual([
      ['eslint/no-console', 'new'],
      ['eslint/file-size', 'unchanged'],
    ]);
    expect(log.runs[0].tool.driver.rules.map((rule) => rule.id)).toEqual([
      'eslint/no-console',
      'eslint/file-size',
    ]);
    expect(log.runs[0].results[1].locations[0].physicalLocation.artifactLocation.uri).toBe(
      'packages/my%20app/src/a.js',
    );
  });
});

describe('renderSnapshotSarifReport', () => {
  const snapshot = {
    summary: { overallStatus: 'violations' },
    findings: [
      finding(),
      finding({
        tool: 'complexity',
        rule: 'cyclomatic',
        identity: 'fn',
        classification: 'descriptive',
      }),
    ],
    toolErrors: [{ tool: 'depcruise', snapshot: 'head', message: 'boom', path: '' }],
  };

  it('writes every finding of the full run with no baseline state', () => {
    const log = JSON.parse(renderSnapshotSarifReport(snapshot, { projectPath }));

    expectValidSarif(log);
    const [run] = log.runs;
    expect(
      run.results.map((result) => [result.ruleId, result.level, result.baselineState]),
    ).toEqual([
      ['eslint/no-console', 'error', undefined],
      ['complexity/cyclomatic', 'note', undefined],
    ]);
    expect(run.results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      'packages/my%20app/src/a.js',
    );
    expect(run.invocations[0].executionSuccessful).toBe(false);
  });
  it('gives a finding the same fingerprint as in the differential run', () => {
    const fingerprint = (log) => log.runs[0].results[0].partialFingerprints;
    const full = JSON.parse(
      renderSnapshotSarifReport({ findings: [finding()], toolErrors: [] }, { projectPath }),
    );
    const diff = JSON.parse(renderSarifReport(report({ newFindings: [finding()] })));

    expect(fingerprint(full)).toEqual(fingerprint(diff));
  });
});

describe('SARIF schema check', () => {
  it('rejects a log the 2.1.0 schema does not allow', () => {
    const log = JSON.parse(
      renderSarifReport(report({ newFindings: [finding()] }), { projectPath }),
    );
    const text = JSON.stringify(log);
    const errorPaths = (from, to) =>
      sarifSchemaErrors(JSON.parse(text.replace(from, to))).map(({ instancePath }) => instancePath);

    expect(sarifSchemaErrors(log)).toEqual([]);
    expect(errorPaths('"baselineState":"new"', '"baselineState":"fixed"')).toEqual([
      '/runs/0/results/0/baselineState',
    ]);
    expect(errorPaths('"startLine":12', '"startLine":0')).toEqual([
      '/runs/0/results/0/locations/0/physicalLocation/region/startLine',
    ]);
    expect(errorPaths('"columnKind":"utf16CodeUnits"', '"columnKind":"bytes"')).toEqual([
      '/runs/0/columnKind',
    ]);
  });
});
