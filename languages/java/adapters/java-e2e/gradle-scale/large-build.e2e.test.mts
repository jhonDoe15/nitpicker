import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mts';
import type { JavaFinding } from '../../typed/java-values.mts';
import { fieldOf, listOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';
import { type Runs, ranOf } from '../test-support/views/runs.mts';
import { LARGE_BUILD_FILES } from './test-support/large-build-files.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const temporary: string[] = [];
type Run = { readonly findings: readonly JavaFinding[]; readonly reports: string };

function writeBuild(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-large-build-'));
  temporary.push(root);
  for (const [file, text] of Object.entries(LARGE_BUILD_FILES)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function analyze(policy: Readonly<Record<string, unknown>>): Run {
  const reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-large-build-reports-'));
  temporary.push(reports);
  const findings = collectJavaFindings(writeBuild(), { gradle, reportDirectory: reports, policy });
  return { findings, reports };
}

function pmdFilesByReport(reports: string): string[][] {
  return readdirSync(reports, { recursive: true, encoding: 'utf8' })
    .filter((file) => path.basename(file) === 'pmd.sarif')
    .map((file) => {
      const sarif: unknown = parseJson(readFileSync(path.join(reports, file), 'utf8'));
      const uris = listOf(fieldOf(sarif, 'runs')).flatMap((run) =>
        listOf(fieldOf(run, 'results')).flatMap((result) =>
          listOf(fieldOf(result, 'locations')).map((location) =>
            textOf(
              fieldOf(fieldOf(fieldOf(location, 'physicalLocation'), 'artifactLocation'), 'uri'),
            ),
          ),
        ),
      );
      return [...new Set(uris.map((uri) => path.basename(uri)))];
    });
}

function rulesAt(findings: readonly JavaFinding[], file: string): string[] {
  return findings
    .filter((finding) => finding.path === file)
    .map(({ tool, rule }) => `${tool} ${rule}`)
    .sort();
}

afterAll(() => {
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)(
  'Java preset on a multi-project build shaped like large real ones',
  () => {
    const runs: Runs<'quick' | 'full', Run> = {};
    beforeAll(() => {
      runs.quick = analyze({ quick: true });
    }, 300_000);
    beforeAll(() => {
      runs.full = analyze({ mutationOff: true });
    }, 300_000);

    it.each(['quick', 'full'] as const)('completes with no tool error in a %s run', (run) => {
      expect(
        ranOf(runs, run).findings.filter(({ classification }) => classification === 'tool-error'),
      ).toEqual([]);
    });

    it.each(['quick', 'full'] as const)('runs PMD on each source file once in a %s run', (run) => {
      const files = pmdFilesByReport(ranOf(runs, run).reports).flat();

      expect(files.toSorted()).toEqual([...new Set(files)].toSorted());
      expect(files).toContain('Counter.java');
    });

    it('compiles the module whose module path comes from an argument provider with Error Prone', () => {
      expect(
        rulesAt(ranOf(runs, 'quick').findings, 'platform/api/src/main/java/demo/api/Greeter.java'),
      ).toContain('errorprone SystemOut');
    });

    it('measures coverage in the full run, where check depends on jacocoTestReport', () => {
      expect(ranOf(runs, 'full').findings.some(({ tool }) => tool === 'jacoco')).toBe(true);
    });
  },
);
