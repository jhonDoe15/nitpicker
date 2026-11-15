import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { checkoutModuleUrl } from '../../shared/paths/checkout-module.mjs';
import { finding, findingLine, policy } from '../diff/execution/test-support/analyzer-findings.mts';
import { runTasksInProcess } from '../diff/execution/test-support/in-process-analyzers.mts';
import { runQualitySnapshot as runQualitySnapshotWithSubprocesses } from './run-snapshot.mts';

type SnapshotOptions = {
  analyzers: readonly unknown[];
  projectRoot: string;
  [option: string]: unknown;
};

function runQualitySnapshot(options: SnapshotOptions) {
  return runQualitySnapshotWithSubprocesses({
    runTasks: runTasksInProcess,
    scope: undefined,
    ...options,
  });
}

const fakeAnalyzerPath = fileURLToPath(
  checkoutModuleUrl(new URL('../diff/execution/test-support/fake-analyzer.mjs', import.meta.url)),
);
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('quality snapshot run', () => {
  it('is clean when no analyzer reports an enforceable finding', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });

    const report = runQualitySnapshot({ analyzers: [fakeAnalyzer()], projectRoot });

    expect(report.summary.overallStatus).toBe('clean');
    expect(report.summary.enforceableFindings).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it('turns the status into a tool error when the run carries a setup error', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    const setupError = {
      tool: 'source-roots',
      snapshot: 'head',
      rule: 'empty-sources',
      path: '',
      message: 'No TypeScript or JavaScript files under src; nothing was analyzed.',
    };

    const report = runQualitySnapshot({
      analyzers: [fakeAnalyzer()],
      projectRoot,
      setupErrors: [setupError],
    });

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.toolErrors).toEqual([setupError]);
  });

  it('reports violations for every enforceable finding present right now, with no baseline', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy(),
      'src/main/existing.ts': findingLine(finding({ identity: 'existing' })),
    });

    const report = runQualitySnapshot({ analyzers: [fakeAnalyzer()], projectRoot });

    expect(report.summary.overallStatus).toBe('violations');
    expect(report.summary.enforceableFindings).toBe(1);
    expect(report.findings).toEqual([
      {
        tool: 'fake-quality-analyzer',
        rule: 'fixture-rule',
        path: 'src/main/existing.ts',
        identity: 'existing',
        message: 'Fixture finding',
        classification: 'enforceable',
        location: { line: 1, column: 4 },
      },
    ]);
    expect(report.summary.tools).toEqual([
      {
        name: 'fake-quality-analyzer',
        version: '1.0.0',
        configurationHash: 'fixture-policy',
        total: 1,
        enforceable: 1,
        descriptive: 0,
      },
    ]);
  });

  it('does not count a descriptive finding as a violation', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy(),
      'src/main/metric.ts': findingLine(
        finding({
          identity: 'metric',
          classification: 'descriptive',
          metric: { name: 'fanIn', value: 4 },
        }),
      ),
    });

    const report = runQualitySnapshot({ analyzers: [fakeAnalyzer()], projectRoot });

    expect(report.summary.overallStatus).toBe('clean');
    expect(report.summary.enforceableFindings).toBe(0);
    expect(report.findings).toHaveLength(1);
  });

  it('separates a finding an analyzer reports as its own tool error', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy(),
      'src/main/broken.ts': findingLine(
        finding({ identity: 'broken', classification: 'tool-error', message: 'partial analysis' }),
      ),
    });

    const report = runQualitySnapshot({ analyzers: [fakeAnalyzer()], projectRoot });

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.findings).toEqual([]);
    expect(report.toolErrors).toEqual([
      {
        tool: 'fake-quality-analyzer',
        snapshot: 'head',
        rule: 'fixture-rule',
        path: 'src/main/broken.ts',
        message: 'partial analysis',
      },
    ]);
  });

  it('surfaces an analyzer crash as a tool error rather than throwing', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy({ mode: 'crash' }),
    });

    const report = runQualitySnapshot({
      analyzers: [fakeAnalyzer()],
      projectRoot,
      runTasks: undefined,
    });

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.toolErrors).toHaveLength(1);
  });
});

function createFixtureRoot(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), 'quality-snapshot-fixture-'));
  temporaryRoots.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  return root;
}

function fakeAnalyzer(overrides: Record<string, unknown> = {}) {
  return {
    name: 'fake-quality-analyzer',
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
    createInvocation({
      projectRoot,
      policyRoot,
      toolRoot,
    }: {
      projectRoot: string;
      policyRoot: string;
      toolRoot: string;
    }) {
      return {
        command: process.execPath,
        args: [
          fakeAnalyzerPath,
          '--root',
          projectRoot,
          '--policy-root',
          policyRoot,
          '--tool-root',
          toolRoot,
        ],
        cwd: policyRoot,
      };
    },
    ...overrides,
  };
}
