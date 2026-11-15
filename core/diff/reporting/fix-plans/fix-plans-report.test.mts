import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../git/test-support/git-repository.mts';
import { REPORT_FILE_NAMES, fixPlansFor, writeDiffReports } from '../reporters.mts';
import { renderConsoleSummary } from '../summary.mts';
import { parseJson } from '../../../../shared/values/readers.mts';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { finding, report } from '../test-support/report-builders.mts';

const { temporaryRoot: fixtureRoot } = useGitFixtures();

function temporaryRoot(): string {
  const root = fixtureRoot('nitpicker-plans-');
  return root;
}

const LONG_FILE: ReportEntry = {
  ...finding({
    tool: 'structure',
    rule: 'file-lines-limit',
    path: 'src/big.ts',
    message: 'src/big.ts has 12 lines; limit is 10.',
  }),
  location: undefined,
};

function runWith(findings: readonly ReportEntry[]) {
  const project = temporaryRoot();
  mkdirSync(path.join(project, 'src'));
  writeFileSync(path.join(project, 'src/big.ts'), 'export function a() {\n  return 1;\n}\n');
  const outputRoot = path.join(project, 'out');
  const data = report({ newFindings: findings });
  const location = { projectPath: '', repositoryRoot: project };
  data.fixPlans = fixPlansFor(data, location);
  const text = writeDiffReports(outputRoot, data, location);
  return { data, text: text ?? '', outputRoot };
}

describe('fix-plans.json', () => {
  it('is one of the files a comparison run writes', () => {
    expect(REPORT_FILE_NAMES.filter((name) => name.startsWith('fix-'))).toEqual(['fix-plans.json']);
  });

  it('holds a plan for a new finding of a nitpicker check, built from the project files', () => {
    const { outputRoot } = runWith([LONG_FILE]);
    const plans = parseJson(readFileSync(path.join(outputRoot, 'fix-plans.json'), 'utf8'));

    expect(plans).toEqual([
      {
        finding: { tool: 'structure', rule: 'file-lines-limit', path: 'src/big.ts' },
        kind: 'split-file',
        target: { path: 'src/big.ts', startLine: 1, endLine: 4 },
        context: {
          lines: 12,
          limit: 10,
          declarations: [{ name: 'a', startLine: 1, endLine: 3, lines: 3 }],
        },
        steps: [
          'Read src/big.ts: 12 lines, limit 10.',
          'Move the largest declarations that belong together into a new file: a.',
          'Move cohesive declarations into a new file beside this one and import them.',
          'Create the file beside this one, or in a new subfolder when the folder is near its file limit.',
          'Update the imports of every user of what moved, and keep each file under its limit.',
        ],
        doneWhen: 'nitpicker reports no structure/file-lines-limit finding for src/big.ts:1-4.',
      },
    ]);
  });

  it('is an empty list when no finding has a plan', () => {
    const { outputRoot } = runWith([finding()]);

    expect(parseJson(readFileSync(path.join(outputRoot, 'fix-plans.json'), 'utf8'))).toEqual([]);
  });
});

function linesStarting(text: string, prefix: string): string[] {
  return text.split('\n').filter((line) => line.startsWith(prefix));
}

describe('the text report and the console summary', () => {
  it('list one short line per plan, and the summary one line with the count', () => {
    const { data, text, outputRoot } = runWith([LONG_FILE, finding()]);
    const summary = renderConsoleSummary(data, {
      color: false,
      details: false,
      diagnosticsPath: `${outputRoot}/report.txt`,
    });

    expect(linesStarting(text, 'Fix plans')).toEqual(['Fix plans (steps in fix-plans.json):']);
    expect(linesStarting(text, '  structure/')).toEqual([
      '  structure/file-lines-limit src/big.ts:1 split-file',
    ]);
    expect(linesStarting(summary, 'Fix plans')).toEqual([
      `Fix plans: 1, see ${outputRoot}/fix-plans.json`,
    ]);
  });

  it('print no plan line without a plan', () => {
    const { data, text } = runWith([finding()]);

    expect(linesStarting(text, 'Fix plans')).toEqual([]);
    expect(
      linesStarting(renderConsoleSummary(data, { color: false, details: false }), 'Fix plans'),
    ).toEqual([]);
  });
});
