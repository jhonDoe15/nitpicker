import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeSnapshotReports } from '../../../../snapshot/reporters.mts';

const METRIC_RULE = 'module-coupling';

export const PRESETS = {
  typescript: {
    tool: 'eslint-lint',
    rule: 'no-debugger',
    file: (index) => `src/feature-${String(index)}.ts`,
    metricTool: 'coupling',
    metricRule: METRIC_RULE,
  },
  java: {
    tool: 'pmd',
    rule: 'UnusedLocalVariable',
    file: (index) => `src/main/java/app/Feature${String(index)}.java`,
    metricTool: 'java-coupling',
    metricRule: METRIC_RULE,
  },
  python: {
    tool: 'ruff',
    rule: 'F401',
    file: (index) => `app/feature_${String(index)}.py`,
    metricTool: 'python-coupling',
    metricRule: METRIC_RULE,
  },
};

export function failingFinding(preset, index) {
  return {
    tool: preset.tool,
    rule: preset.rule,
    path: preset.file(index),
    identity: `failing:${String(index)}`,
    message: `Remove the unused code in ${preset.file(index)}.`,
    classification: 'enforceable',
    location: { line: index + 1 },
  };
}

export function metricFinding(preset, index, value) {
  return {
    tool: preset.metricTool,
    rule: preset.metricRule,
    path: preset.file(index),
    identity: `metric:${String(index)}`,
    message: `fanIn for ${preset.file(index)}`,
    classification: 'descriptive',
    metric: { name: 'fanIn', value },
  };
}

export function toolCount(name, counts = {}) {
  return {
    name,
    base: 0,
    head: 0,
    new: 0,
    resolved: 0,
    unchanged: 0,
    changedMetrics: 0,
    elapsedMs: 0,
    ...counts,
  };
}

export function snapshotReport({ findings = [], tools = [], toolErrors = [] }) {
  const enforceable = findings.filter(({ classification }) => classification === 'enforceable');
  return {
    summary: {
      overallStatus: toolErrors.length > 0 ? 'tool-error' : 'violations',
      enforceableFindings: enforceable.length,
      tools,
      elapsedMs: 0,
    },
    findings,
    toolErrors,
  };
}

export function snapshotReportText(input) {
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-console-'));
  try {
    writeSnapshotReports(outputRoot, snapshotReport(input));
    return readFileSync(path.join(outputRoot, 'report.txt'), 'utf8');
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}
