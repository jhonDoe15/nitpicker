import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runQualitySnapshot } from './run-snapshot.mjs';

const fakeAnalyzerPath = path.join(import.meta.dirname, '../diff/fixtures/fake-analyzer.mjs');
const temporaryRoots = [];

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

  it('reports violations for every enforceable finding present right now, with no baseline', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy(),
      'src/main/existing.ts': findingLine(finding({ identity: 'existing' })),
    });

    const report = runQualitySnapshot({ analyzers: [fakeAnalyzer()], projectRoot });

    expect(report.summary.overallStatus).toBe('violations');
    expect(report.summary.enforceableFindings).toBe(1);
    expect(report.findings).toEqual([
      expect.objectContaining({ identity: 'existing', classification: 'enforceable' }),
    ]);
    expect(report.summary.tools).toEqual([
      expect.objectContaining({
        name: 'fake-quality-analyzer',
        total: 1,
        enforceable: 1,
        descriptive: 0,
      }),
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
      expect.objectContaining({ tool: 'fake-quality-analyzer', message: 'partial analysis' }),
    ]);
  });

  it('surfaces an analyzer crash as a tool error rather than throwing', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy({ mode: 'crash' }),
    });

    const report = runQualitySnapshot({ analyzers: [fakeAnalyzer()], projectRoot });

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.toolErrors).toHaveLength(1);
  });
});

function createFixtureRoot(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'quality-snapshot-fixture-'));
  temporaryRoots.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  return root;
}

function fakeAnalyzer(overrides = {}) {
  return {
    name: 'fake-quality-analyzer',
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
    createInvocation({ projectRoot, policyRoot, toolRoot }) {
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

function finding(overrides = {}) {
  return {
    tool: 'fake-quality-analyzer',
    rule: 'fixture-rule',
    identity: 'fixture-identity',
    message: 'Fixture finding',
    classification: 'enforceable',
    ...overrides,
  };
}

function findingLine(value, marker = 'QUALITY_FINDING') {
  return `// ${marker} ${JSON.stringify(value)}\n`;
}

function policy(overrides = {}) {
  return `${JSON.stringify({ marker: 'QUALITY_FINDING', ...overrides }, null, 2)}\n`;
}
