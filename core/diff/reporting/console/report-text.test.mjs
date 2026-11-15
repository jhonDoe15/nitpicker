import { describe, expect, it } from 'vitest';
import { renderTextReport } from '../text.mts';
import {
  PRESETS,
  failingFinding,
  metricFinding,
  snapshotReportText,
  toolCount,
} from './test-support/support.mjs';

function diffReport(preset, { metrics = [], changedMetrics = [], tools } = {}) {
  const newFindings = [
    metricFinding(preset, 1, 3),
    failingFinding(preset, 1),
    ...metrics,
    failingFinding(preset, 2),
  ];
  return {
    summary: {
      requestedBaseRef: 'main',
      mergeBaseSha: 'a',
      headSha: 'b',
      overallStatus: 'completed',
      newEnforceableFindings: 2,
      tools: tools ?? [
        toolCount(preset.tool, { head: 2, new: 2 }),
        toolCount(preset.metricTool, { head: 1, new: 1 }),
        toolCount('coverage'),
        toolCount('crap'),
      ],
    },
    newFindings,
    resolvedFindings: [],
    unchangedFindings: [],
    changedMetrics,
    toolErrors: [],
  };
}

describe.each(Object.entries(PRESETS))('the diff report.txt for %s findings', (_name, preset) => {
  it('lists the failing findings first, then the report-only ones with their values', () => {
    const lines = renderTextReport(diffReport(preset)).split('\n');
    const failing = lines.indexOf('New failing findings:');
    const reportOnly = lines.indexOf('New report-only findings:');

    expect(failing).toBeGreaterThan(-1);
    expect(reportOnly).toBeGreaterThan(failing);
    expect(lines.slice(failing + 1, failing + 3)).toEqual([
      `${preset.tool}/${preset.rule} ${preset.file(1)}:2 Remove the unused code in ${preset.file(1)}.`,
      `${preset.tool}/${preset.rule} ${preset.file(2)}:3 Remove the unused code in ${preset.file(2)}.`,
    ]);
    expect(lines[reportOnly + 1]).toBe(
      `${preset.metricTool}/${preset.metricRule} ${preset.file(1)} fanIn for ${preset.file(1)} (fanIn 3)`,
    );
  });

  it('shows the limit of a metric finding that has one', () => {
    const limited = {
      ...metricFinding(preset, 4, 12),
      metric: { name: 'fanIn', value: 12, limit: 10 },
    };
    const lines = renderTextReport(diffReport(preset, { metrics: [limited] })).split('\n');

    expect(lines.filter((line) => line.includes(`fanIn for ${preset.file(4)}`))).toEqual([
      `${preset.metricTool}/${preset.metricRule} ${preset.file(4)} fanIn for ${preset.file(4)} (fanIn 12, limit 10)`,
    ]);
  });

  it('rounds a metric delta to the precision of the values', () => {
    const changed = (baseValue, headValue) => ({
      tool: preset.metricTool,
      rule: preset.metricRule,
      path: '.',
      metric: 'largestComponentShare',
      baseValue,
      headValue,
      delta: headValue - baseValue,
    });
    const lines = renderTextReport(
      diffReport(preset, {
        changedMetrics: [changed(1, 0.6667), changed(0.1, 0.2), changed(4, 7), changed(5, 2)],
      }),
    ).split('\n');
    const prefix = `${preset.metricTool}/${preset.metricRule} . largestComponentShare:`;

    expect(lines.filter((line) => line.includes('largestComponentShare'))).toEqual([
      `${prefix} 1 -> 0.6667 (-0.3333)`,
      `${prefix} 0.1 -> 0.2 (+0.1)`,
      `${prefix} 4 -> 7 (+3)`,
      `${prefix} 5 -> 2 (-3)`,
    ]);
  });

  it('keeps the per-tool rows with counts and counts the clean analyzers', () => {
    const lines = renderTextReport(diffReport(preset)).split('\n');
    const start = lines.indexOf('Per-tool counts:');

    expect(lines.slice(start + 1, start + 4).map((line) => line.split(':')[0])).toEqual([
      preset.tool,
      preset.metricTool,
      '2 analyzers ran clean',
    ]);
    expect(lines.filter((line) => line.startsWith('coverage:'))).toEqual([]);
  });

  it('keeps a skipped analyzer in the table', () => {
    const lines = renderTextReport(
      diffReport(preset, {
        tools: [toolCount('coverage'), toolCount('crap', { skippedBecause: 'coverage' })],
      }),
    ).split('\n');

    expect(lines.filter((line) => line.startsWith('crap:'))).toEqual([
      'crap: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=0.000s skipped (coverage failed)',
    ]);
    expect(lines.filter((line) => line.endsWith('ran clean'))).toEqual(['1 analyzer ran clean']);
  });
});

describe.each(Object.entries(PRESETS))(
  'the snapshot report.txt for %s findings',
  (_name, preset) => {
    const findings = [metricFinding(preset, 1, 0.5), failingFinding(preset, 1)];
    const tools = [
      { name: preset.tool, total: 1, enforceable: 1, descriptive: 0 },
      { name: preset.metricTool, total: 1, enforceable: 0, descriptive: 1 },
      { name: 'coverage', total: 0, enforceable: 0, descriptive: 0 },
      { name: 'crap', total: 0, enforceable: 0, descriptive: 0 },
    ];

    it('lists failing findings first and shows metric values', () => {
      const lines = snapshotReportText({ findings, tools }).split('\n');
      const failing = lines.indexOf('Enforceable findings:');
      const reportOnly = lines.indexOf('Descriptive findings:');

      expect(failing).toBeGreaterThan(-1);
      expect(reportOnly).toBeGreaterThan(failing);
      expect(lines[reportOnly + 1]).toMatch(/^.* \(fanIn 0\.5\)$/u);
    });

    it('keeps the per-tool rows with counts and counts the clean analyzers', () => {
      const lines = snapshotReportText({ findings, tools }).split('\n');
      const start = lines.indexOf('Per-tool counts:');

      expect(lines.slice(start + 1, start + 4)).toEqual([
        `${preset.tool}: total=1 enforceable=1 descriptive=0`,
        `${preset.metricTool}: total=1 enforceable=0 descriptive=1`,
        '2 analyzers ran clean',
      ]);
    });
  },
);
