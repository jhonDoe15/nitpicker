import { describe, expect, it } from 'vitest';
import { renderSnapshotConsoleSummary } from '../../../snapshot/reporters.mts';
import {
  PRESETS,
  failingFinding,
  metricFinding,
  snapshotReport,
  snapshotReportText,
} from './test-support/support.mjs';

const ROOT = '/work/app';
const FINDING_COUNT = 12;
const NOTE_COUNT = 150;
const CLEAN_ANALYZERS = 17;
const MISSING = `Cannot find package 'typescript' imported from ${ROOT}/node_modules/nitpicker/package.json`;

function inputFor(preset) {
  const findings = [
    ...Array.from({ length: FINDING_COUNT }, (_, index) => failingFinding(preset, index)),
    ...Array.from({ length: NOTE_COUNT }, (_, index) => metricFinding(preset, index, index)),
  ];
  const tools = [
    { name: preset.tool, total: FINDING_COUNT, enforceable: FINDING_COUNT, descriptive: 0 },
    { name: preset.metricTool, total: NOTE_COUNT, enforceable: 0, descriptive: NOTE_COUNT },
    ...Array.from({ length: CLEAN_ANALYZERS }, (_, index) => ({
      name: `clean-${String(index)}`,
      total: 0,
      enforceable: 0,
      descriptive: 0,
    })),
  ];
  const toolErrors = ['base', 'head'].flatMap((snapshot) =>
    ['eslint', 'jscpd', 'knip', 'madge'].map((tool) => ({ tool, snapshot, message: MISSING })),
  );
  return { findings, tools, toolErrors };
}

function consoleOf(input) {
  return renderSnapshotConsoleSummary(snapshotReport(input), {
    diagnosticsPath: 'reports/quality/snapshot/report.txt',
    color: false,
  });
}

describe.each(Object.entries(PRESETS))('the --all console for a %s snapshot', (_name, preset) => {
  const input = inputFor(preset);

  it('stays bounded however many findings and tool errors the snapshot has', () => {
    const lines = consoleOf(input).split('\n');

    expect(lines.length).toBeLessThan(60);
    expect(lines).toContain(
      `Design notes for review (not failing): ${String(NOTE_COUNT)} in the snapshot`,
    );
    expect(lines).toContain(
      `  … ${String(NOTE_COUNT - 10)} more; see reports/quality/snapshot/report.txt`,
    );
    expect(lines).toContain(`✖ ${String(FINDING_COUNT)} enforceable findings`);
    expect(lines).toContain('✖ 8 tool errors');
    expect(lines.filter((line) => line.startsWith('  eslint ('))).toHaveLength(2);
    expect(lines.at(-2)).toBe('Full diagnostics: reports/quality/snapshot/report.txt');
  });

  it('prints only the analyzers with findings and counts the clean ones', () => {
    const lines = consoleOf(input).split('\n');
    const start = lines.indexOf('By analyzer:');

    expect(lines.slice(start + 1, start + 4)).toEqual([
      `  ${preset.tool}: ${String(FINDING_COUNT)} enforceable, 0 descriptive`,
      `  ${preset.metricTool}: 0 enforceable, ${String(NOTE_COUNT)} descriptive`,
      `  ${String(CLEAN_ANALYZERS)} analyzers ran clean`,
    ]);
    expect(lines.join('\n')).not.toContain('clean-0');
  });

  it('leaves the full list in report.txt', () => {
    const text = snapshotReportText(input);

    const lines = text.split('\n');

    expect(lines.filter((line) => line.includes('Remove the unused code'))).toHaveLength(
      FINDING_COUNT,
    );
    expect(lines.filter((line) => line.includes('(fanIn '))).toHaveLength(NOTE_COUNT);
    expect(text).toContain(`Enforceable findings: ${String(FINDING_COUNT)}`);
    expect(text).toContain(`Tool errors: ${String(input.toolErrors.length)}`);
  });

  it('prints the green line for a snapshot without findings', () => {
    const lines = consoleOf({ ...input, findings: [], toolErrors: [] }).split('\n');

    expect(lines).toContain('✓ No enforceable findings');
  });
});
