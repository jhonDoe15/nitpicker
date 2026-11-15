import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  renderBaselineSarifReport,
  renderSarifReport,
  renderSnapshotSarifReport,
} from '../sarif.mts';
import { expectValidSarif } from '../test-support/format-checks/report-assertions.mts';
import { finding, report } from '../test-support/report-builders.mts';
import { fieldAt, listOf } from '../../../../scripts/json/fields.mts';
import type { Finding } from '../../../../shared/values/findings.mts';
import { parseJson } from '../../../../shared/values/readers.mts';
import { SARIF_UPLOAD_LIMITS } from './sarif-limits.mts';

function numbered(count: number, overrides: Partial<Finding> = {}): Finding[] {
  return Array.from({ length: count }, (_, index) =>
    finding({ identity: `f${String(index)}`, path: `src/f${String(index)}.js`, ...overrides }),
  );
}

function held(count: number): Finding[] {
  return numbered(count, {
    rule: 'file-size',
    ratchet: { key: 'size', value: 7 },
    heldAtBase: 7,
  }).map((value, index) => ({ ...value, identity: `h${String(index)}` }));
}

function notificationsOf(log: unknown): unknown {
  return fieldAt(log, 'runs', 0, 'invocations', 0, 'toolExecutionNotifications');
}

describe('SARIF upload limits', () => {
  it('matches the limits GitHub code scanning puts on one upload', () => {
    expect(SARIF_UPLOAD_LIMITS).toEqual({ results: 25_000, gzipBytes: 10_485_760 });
  });
  it('keeps the new findings first and says how many held ones the baseline file leaves out', () => {
    const limits = { results: 3, gzipBytes: SARIF_UPLOAD_LIMITS.gzipBytes };
    const log = parseJson(
      renderBaselineSarifReport(report({ newFindings: numbered(2), unchangedFindings: held(4) }), {
        limits,
      }),
    );

    expectValidSarif(log);
    expect(
      listOf(fieldAt(log, 'runs', 0, 'results')).map((result) => fieldAt(result, 'baselineState')),
    ).toEqual(['new', 'new', 'unchanged']);
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
    const gzipped = (count: number): number =>
      gzipSync(
        renderSnapshotSarifReport({
          summary: {},
          findings: findings.slice(0, count),
          toolErrors: [],
        }),
      ).length;
    const limits = { results: 25_000, gzipBytes: gzipped(20) + 300 };

    const text = renderSnapshotSarifReport({ summary: {}, findings, toolErrors: [] }, { limits });
    const log = parseJson(text);
    const kept = listOf(fieldAt(log, 'runs', 0, 'results')).length;

    expect(kept).toBe(20);

    expect(gzipSync(text).length).toBeLessThanOrEqual(limits.gzipBytes);
    expect(gzipped(kept + 1)).toBeGreaterThan(limits.gzipBytes);
    expect(fieldAt(notificationsOf(log), 0, 'message', 'text')).toBe(
      `This file lists the first ${String(kept)} of 40 findings, because GitHub code scanning rejects a SARIF run of more than 25000 results or a file over ${String(Math.round((limits.gzipBytes / 1_048_576) * 10) / 10)} MB gzipped. The rest are in findings.json.`,
    );
  });
  it('cuts a run at 25,000 results by default', () => {
    const log = parseJson(renderSarifReport(report({ newFindings: numbered(25_001) })));

    expect(fieldAt(log, 'runs', 0, 'results')).toHaveLength(25_000);
    expect(
      fieldAt(
        log,
        'runs',
        0,
        'results',
        -1,
        'locations',
        0,
        'physicalLocation',
        'artifactLocation',
        'uri',
      ),
    ).toBe('src/f24999.js');
  });
  it('writes every result and no notification when the file is within the limits', () => {
    const log = parseJson(renderSarifReport(report({ newFindings: numbered(3) })));

    expect(fieldAt(log, 'runs', 0, 'results')).toHaveLength(3);
    expect(notificationsOf(log)).toEqual([]);
  });
});

describe('SARIF source root', () => {
  it('gives %SRCROOT% the repository root as a file URI ending in a slash', () => {
    const log = parseJson(
      renderSarifReport(report({ newFindings: [finding()] }), {
        projectPath: 'packages/app',
        repositoryRoot: '/work/my repo',
      }),
    );

    expectValidSarif(log);
    expect(fieldAt(log, 'runs', 0, 'originalUriBaseIds')).toEqual({
      '%SRCROOT%': {
        uri: 'file:///work/my%20repo/',
        description: { text: 'The root of the git repository the findings are in.' },
      },
    });
    expect(
      fieldAt(log, 'runs', 0, 'results', 0, 'locations', 0, 'physicalLocation', 'artifactLocation'),
    ).toEqual({
      uri: 'packages/app/src/a.js',
      uriBaseId: '%SRCROOT%',
    });
  });
  it('writes no base id without a repository root', () => {
    const log = parseJson(
      renderSarifReport(report({ newFindings: [finding()] }), { projectPath: 'packages/app' }),
    );

    expect(fieldAt(log, 'runs', 0, 'originalUriBaseIds')).toBeUndefined();
  });
});
