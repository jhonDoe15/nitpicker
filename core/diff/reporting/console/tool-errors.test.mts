import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderConsoleSummary, renderSnapshotConsole } from '../summary.mts';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingUrl,
} from '../../../../shared/messages/troubleshooting.mts';
import { failedModuleFindings } from '../../../../languages/java/maven/reactor/failed-modules.mts';
import { skippedModuleFindings } from '../../../../languages/java/adapters/gradle-wrapper/partial/failed-tool-tasks.mts';

const ROOT = '/home/me/app';
const ANALYZERS = Array.from({ length: 12 }, (_, index) => `analyzer-${String(index)}`);
const MISSING = `Cannot find package 'typescript' imported from ${ROOT}/node_modules/nitpicker/package.json`;

function summaryOf(toolErrors: readonly ReportEntry[]): string {
  return renderConsoleSummary(
    {
      summary: {},
      newFindings: [],
      resolvedFindings: [],
      unchangedFindings: [],
      changedMetrics: [],
      toolErrors,
    },
    { color: false, details: false, projectRoot: ROOT },
  );
}

function errorLines(summary: string): string[] {
  return summary.split('\n').filter((line) => line.startsWith('  '));
}

function everywhere(message: string): ReportEntry[] {
  return ANALYZERS.flatMap((tool) =>
    ['base', 'head'].map((snapshot) => ({ tool, snapshot, message })),
  );
}

describe('console tool errors', () => {
  it('prints one entry for 12 analyzers on 2 snapshots that fail with one message', () => {
    const summary = summaryOf(everywhere(MISSING));

    expect(summary.split('\n').filter((line) => line.startsWith('✖'))).toEqual([
      '✖ 24 tool errors (1 distinct)',
    ]);
    expect(errorLines(summary)).toEqual([
      "  analyzer-0, analyzer-1 and 10 more (base and head): Cannot find package 'typescript' imported from ./node_modules/nitpicker/package.json",
    ]);
  });

  it('prints one entry per distinct message', () => {
    const summary = summaryOf([
      ...everywhere(MISSING).slice(0, 4),
      { tool: 'coverage', snapshot: 'head', message: 'coverage crashed: ENOENT' },
    ]);

    expect(errorLines(summary)).toEqual([
      "  analyzer-0 and analyzer-1 (base and head): Cannot find package 'typescript' imported from ./node_modules/nitpicker/package.json",
      '  coverage (head): ENOENT',
    ]);
  });

  it('names the snapshots of each analyzer when only some of them failed on both', () => {
    const summary = summaryOf([
      { tool: 'pmd', snapshot: 'base', message: 'Invalid JAVA_HOME' },
      { tool: 'pmd', snapshot: 'head', message: 'Invalid JAVA_HOME' },
      { tool: 'spotbugs', snapshot: 'head', message: 'Invalid JAVA_HOME' },
    ]);

    expect(errorLines(summary)).toEqual([
      '  pmd (base and head) and spotbugs (head): Invalid JAVA_HOME',
    ]);
  });

  it('keeps the troubleshooting link and makes every path under the project root relative', () => {
    const link = `See ${String(troubleshootingUrl(TROUBLESHOOTING_ANCHORS.pythonEnvironment))}`;
    const summary = summaryOf([
      { tool: 'ruff', snapshot: 'head', message: `No python at ${ROOT}/.venv/bin/python. ${link}` },
      { tool: 'mypy', snapshot: 'head', message: `No python at ${ROOT}/.venv/bin/python. ${link}` },
      { tool: 'bandit', snapshot: 'head', message: `No python at /opt/other/bin/python. ${link}` },
    ]);

    expect(errorLines(summary)).toEqual([
      `  ruff and mypy (head): No python at ./.venv/bin/python. ${link}`,
      `  bandit (head): No python at /opt/other/bin/python. ${link}`,
    ]);
    expect(summary).not.toContain(ROOT);
  });

  it('does not treat a sibling folder that starts with the project root as inside it', () => {
    const summary = summaryOf([
      { tool: 'ruff', snapshot: 'head', message: `missing ${ROOT}-tools/bin and ${ROOT}` },
    ]);

    expect(errorLines(summary)).toEqual([`  ruff (head): missing ${ROOT}-tools/bin and .`]);
  });

  it('rewrites the root at the end of a sentence but not inside a longer path', () => {
    const summary = summaryOf([
      {
        tool: 'ruff',
        snapshot: 'head',
        message: `Run it in ${ROOT}. Not /usr/local${ROOT}/x, and not ${ROOT}.bak.`,
      },
    ]);

    expect(errorLines(summary)).toEqual([
      `  ruff (head): Run it in .. Not /usr/local${ROOT}/x, and not ${ROOT}.bak.`,
    ]);
  });

  it('folds a skipped dependent into the line of the analyzer that failed', () => {
    const summary = summaryOf([
      { tool: 'coverage', snapshot: 'head', message: 'coverage failed: ENOENT' },
      { tool: 'crap', snapshot: 'head', message: 'crap skipped: coverage failed (see above)' },
    ]);

    expect(errorLines(summary)).toEqual(['  coverage (head): ENOENT (crap skipped)']);
  });

  it('keeps a skipped dependent whose cause is not listed', () => {
    const summary = summaryOf([
      { tool: 'crap', snapshot: 'head', message: 'crap skipped: coverage failed (see above)' },
    ]);

    expect(errorLines(summary)).toEqual([
      '  crap (head): crap skipped: coverage failed (see above)',
    ]);
  });

  it('shows the failed module name directly for maven and gradle module-build-failed errors', () => {
    const mavenErrors = failedModuleFindings(
      [
        {
          module: {
            coordinates: 'demo:checks:1.0',
            packaging: 'jar',
            basedir: path.join(ROOT, 'checks'),
            buildDirectory: path.join(ROOT, 'checks', 'target'),
          },
          reason:
            'Failed to execute goal org.apache.maven.plugins:maven-enforcer-plugin:3.5.0:enforce on project checks: Rule failed: Error: file not found',
        },
      ],
      ROOT,
    );
    const gradleErrors = skippedModuleFindings(
      [{ path: ':docs:processor', dir: 'docs/processor' }],
      {
        tasks: [
          {
            project: ':docs:processor',
            task: 'nitpickerPmd',
            reason: 'Error: PMD config not found',
          },
        ],
        error: new Error('failed'),
      },
    );
    const diffSummary = summaryOf(
      [...mavenErrors, ...gradleErrors].map((error) => ({ ...error, snapshot: 'head' })),
    );
    const snapshotSummary = renderSnapshotConsole(
      { summary: {}, findings: [], toolErrors: [...mavenErrors, ...gradleErrors] },
      { color: false, details: false, projectRoot: ROOT },
    );

    expect(errorLines(diffSummary)).toEqual([
      expect.stringContaining('maven (head): Maven could not build module checks,'),
      expect.stringContaining(
        'gradle (head): A nitpicker tool task failed in Gradle project :docs:processor,',
      ),
    ]);
    expect(errorLines(snapshotSummary)).toEqual([
      expect.stringContaining('maven: Maven could not build module checks,'),
      expect.stringContaining(
        'gradle: A nitpicker tool task failed in Gradle project :docs:processor,',
      ),
    ]);
  });
});
