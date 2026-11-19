import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeSnapshotReports } from '../../../../snapshot/reporters.mts';
import type { Finding, ReportEntry } from '../../../../../shared/values/findings.mts';

export type Preset = {
  readonly tool: string;
  readonly rule: string;
  readonly file: (index: number) => string;
  readonly metricTool: string;
  readonly metricRule: string;
};

export type ToolCount = { readonly name: string; readonly [field: string]: unknown };

export type SnapshotTool = {
  readonly name: string;
  readonly total: number;
  readonly enforceable: number;
  readonly descriptive: number;
};

export type SnapshotInput = {
  readonly findings?: readonly Finding[];
  readonly tools?: readonly SnapshotTool[];
  readonly toolErrors?: readonly ReportEntry[];
};

const METRIC_RULE = 'module-coupling';

export const PRESETS: Readonly<Record<string, Preset>> = {
  typescript: {
    tool: 'eslint-lint',
    rule: 'no-debugger',
    file: (index: number) => `src/feature-${String(index)}.ts`,
    metricTool: 'coupling',
    metricRule: METRIC_RULE,
  },
  java: {
    tool: 'pmd',
    rule: 'UnusedLocalVariable',
    file: (index: number) => `src/main/java/app/Feature${String(index)}.java`,
    metricTool: 'java-coupling',
    metricRule: METRIC_RULE,
  },
  python: {
    tool: 'ruff',
    rule: 'F401',
    file: (index: number) => `app/feature_${String(index)}.py`,
    metricTool: 'python-coupling',
    metricRule: METRIC_RULE,
  },
};

export function failingFinding(preset: Preset, index: number): Finding {
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

export function metricFinding(preset: Preset, index: number, value: number): Finding {
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

export function toolCount(
  name: string,
  counts: Readonly<Record<string, number | string>> = {},
): ToolCount {
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

export function snapshotReport({ findings = [], tools = [], toolErrors = [] }: SnapshotInput): {
  readonly summary: {
    readonly overallStatus: string;
    readonly enforceableFindings: number;
    readonly tools: readonly SnapshotTool[];
    readonly elapsedMs: number;
  };
  readonly findings: readonly Finding[];
  readonly toolErrors: readonly ReportEntry[];
} {
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

export function snapshotReportText(input: SnapshotInput): string {
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-console-'));
  try {
    writeSnapshotReports(outputRoot, snapshotReport(input));
    return readFileSync(path.join(outputRoot, 'report.txt'), 'utf8');
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}
