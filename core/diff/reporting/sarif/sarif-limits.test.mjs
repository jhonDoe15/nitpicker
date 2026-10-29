import { createHash } from 'node:crypto';
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
  it('keeps the longest run of findings whose gzipped file fits', () => {
    const findings = numbered(40).map((value, index) => ({
      ...value,
      message: Array.from({ length: 8 }, (_, part) =>
        createHash('sha512')
          .update(`${String(index)}:${String(part)}`)
          .digest('hex'),
      ).join(''),
    }));
    const gzipped = (count) =>
      gzipSync(renderSnapshotSarifReport({ findings: findings.slice(0, count), toolErrors: [] }))
        .length;
    const limits = { results: 25_000, gzipBytes: gzipped(20) + 300 };

    const text = renderSnapshotSarifReport({ findings, toolErrors: [] }, { limits });
    const log = JSON.parse(text);
    const kept = log.runs[0].results.length;

    expect(kept).toBe(20);

    expect(gzipSync(text).length).toBeLessThanOrEqual(limits.gzipBytes);
    expect(gzipped(kept + 1)).toBeGreaterThan(limits.gzipBytes);
    expect(notificationsOf(log)[0].message.text).toBe(
      `This file lists the first ${String(kept)} of 40 findings, because GitHub code scanning rejects a SARIF run of more than 25000 results or a file over ${String(Math.round((limits.gzipBytes / 1_048_576) * 10) / 10)} MB gzipped. New findings come first, and findings.json lists them all.`,
    );
  });
  it('cuts a run at 25,000 results by default', () => {
    const log = JSON.parse(renderSarifReport(report({ newFindings: numbered(25_001) })));

    expect(log.runs[0].results).toHaveLength(25_000);
    expect(log.runs[0].results.at(-1).locations[0].physicalLocation.artifactLocation.uri).toBe(
      'src/f24999.js',
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
