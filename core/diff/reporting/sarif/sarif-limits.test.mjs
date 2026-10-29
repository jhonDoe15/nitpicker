import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  renderBaselineSarifReport,
  renderSarifReport,
  renderSnapshotSarifReport,
} from '../sarif.mjs';
import { expectValidSarif } from '../test-support/report-assertions.mjs';
import { finding, report } from '../test-support/report-builders.mjs';
import { SARIF_UPLOAD_LIMITS } from './sarif-limits.mjs';

function numbered(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) =>
    finding({ identity: `f${String(index)}`, path: `src/f${String(index)}.js`, ...overrides }),
  );
}

function held(count) {
  return numbered(count, {
    rule: 'file-size',
    ratchet: { key: 'size', value: 7 },
    heldAtBase: 7,
  }).map((value, index) => ({ ...value, identity: `h${String(index)}` }));
}

function notificationsOf(log) {
  return log.runs[0].invocations[0].toolExecutionNotifications;
}

describe('SARIF upload limits', () => {
  it('matches the limits GitHub code scanning puts on one upload', () => {
    expect(SARIF_UPLOAD_LIMITS).toEqual({ results: 25_000, gzipBytes: 10_485_760 });
  });
  it('keeps the new findings first and says how many held ones the baseline file leaves out', () => {
    const limits = { results: 3, gzipBytes: SARIF_UPLOAD_LIMITS.gzipBytes };
    const log = JSON.parse(
      renderBaselineSarifReport(report({ newFindings: numbered(2), unchangedFindings: held(4) }), {
        limits,
      }),
    );

    expectValidSarif(log);
    expect(log.runs[0].results.map((result) => result.baselineState)).toEqual([
      'new',
      'new',
      'unchanged',
    ]);
    expect(notificationsOf(log)).toEqual([
      {
        level: 'warning',
        message: {
          text: 'This file lists the first 3 of 6 findings, because GitHub code scanning rejects a SARIF run of more than 3 results or a file over 10 MB gzipped. New findings come first, and new-findings.json with held-findings.json lists them all.',
        },
      },
    ]);
  });
  it('drops results until the gzipped file fits, naming the file that has them all', () => {
    const findings = numbered(40, { message: 'x'.repeat(200) });
    const whole = renderSnapshotSarifReport({ findings, toolErrors: [] });
    const limits = { results: 25_000, gzipBytes: Math.floor(gzipSync(whole).length / 2) };

    const text = renderSnapshotSarifReport({ findings, toolErrors: [] }, { limits });
    const log = JSON.parse(text);

    expect(gzipSync(text).length).toBeLessThanOrEqual(limits.gzipBytes);
    expect(log.runs[0].results.length).toBeGreaterThan(0);
    expect(log.runs[0].results.length).toBeLessThan(40);
    expect(notificationsOf(log)[0].message.text).toMatch(
      new RegExp(
        `^This file lists the first ${String(log.runs[0].results.length)} of 40 findings,.* findings\\.json lists them all\\.$`,
        'u',
      ),
    );
  });
  it('writes every result and no notification when the file is within the limits', () => {
    const log = JSON.parse(renderSarifReport(report({ newFindings: numbered(3) })));

    expect(log.runs[0].results).toHaveLength(3);
    expect(notificationsOf(log)).toEqual([]);
  });
});

describe('SARIF source root', () => {
  it('gives %SRCROOT% the repository root as a file URI ending in a slash', () => {
    const log = JSON.parse(
      renderSarifReport(report({ newFindings: [finding()] }), {
        projectPath: 'packages/app',
        repositoryRoot: '/work/my repo',
      }),
    );

    expectValidSarif(log);
    expect(log.runs[0].originalUriBaseIds).toEqual({
      '%SRCROOT%': {
        uri: 'file:///work/my%20repo/',
        description: { text: 'The root of the git repository the findings are in.' },
      },
    });
    expect(log.runs[0].results[0].locations[0].physicalLocation.artifactLocation).toEqual({
      uri: 'packages/app/src/a.js',
      uriBaseId: '%SRCROOT%',
    });
  });
  it('writes no base id without a repository root', () => {
    const log = JSON.parse(
      renderSarifReport(report({ newFindings: [finding()] }), { projectPath: 'packages/app' }),
    );

    expect(log.runs[0].originalUriBaseIds).toBeUndefined();
  });
});
