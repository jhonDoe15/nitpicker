import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { parseJson } from '../../../../../shared/values/readers.mts';
import { run } from '../../execution/python-process.mts';
import { createToolContext } from '../../test-support/typed/tool-context.mts';
import { FACTS_REPORT } from '../python-facts.mts';
import type { IngestedFinding } from '../../typed/report/report-types.mts';
import { readFactFindings } from '../../typed/report/report-views.mts';
import { collectFacts, type FactsReport } from '../../test-support/views/test-views.mts';

type FactsProject = {
  factsOf: (
    files: Files,
    options?: { base?: Files; moves?: unknown },
  ) => FactsReport & { findings: () => IngestedFinding[] };
  nearDuplicates: (files: Files) => IngestedFinding[];
  cleanup: () => void;
};

type Files = Readonly<Record<string, string>>;

export function createFactsProjects(): FactsProject {
  const roots: string[] = [];

  function temporaryRoot(prefix: string): string {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
    roots.push(root);
    return root;
  }

  function projectOf(files: Files): string {
    const root = temporaryRoot('nitpicker-facts-');
    writeFiles(root, files);
    return root;
  }

  function movesFileOf(moves: unknown): string | undefined {
    if (moves === undefined) {
      return undefined;
    }
    const file = path.join(temporaryRoot('nitpicker-facts-moves-'), 'moves.json');
    writeFileSync(file, JSON.stringify(moves));
    return file;
  }

  function factsOf(files: Files, { base, moves }: { base?: Files; moves?: unknown } = {}) {
    const root = projectOf(files);
    const reportRoot = temporaryRoot('nitpicker-facts-report-');
    const context = createToolContext({
      projectRoot: root,
      liveRoot: root,
      settings: { environment: 'path', sourceRoots: ['src'] },
      reportRoot,
      baselineRoot: base === undefined ? undefined : projectOf(base),
    });
    const report = collectFacts(context, run);
    expect(parseJson(readFileSync(path.join(reportRoot, FACTS_REPORT), 'utf8'))).toEqual(report);
    const baselineMovesFile = movesFileOf(moves);
    return { ...report, findings: () => readFactFindings(reportRoot, { baselineMovesFile }) };
  }

  function nearDuplicates(files: Files): IngestedFinding[] {
    return factsOf(files)
      .findings()
      .filter(({ rule }) => rule === 'near-duplicate');
  }

  function cleanup(): void {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  return { factsOf, nearDuplicates, cleanup };
}
