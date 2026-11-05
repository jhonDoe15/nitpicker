import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { run } from '../../execution/python-process.mjs';
import { createToolContext } from '../../python-tools.mjs';
import { collectFacts, FACTS_REPORT, readFactFindings } from '../python-facts.mjs';

export function createFactsProjects() {
  const roots = [];

  function temporaryRoot(prefix) {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
    roots.push(root);
    return root;
  }

  function projectOf(files) {
    const root = temporaryRoot('nitpicker-facts-');
    for (const [file, content] of Object.entries(files)) {
      const target = path.resolve(root, file);
      if (!target.startsWith(root + path.sep)) {
        throw new Error(`${file} is outside the project`);
      }
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return root;
  }

  function movesFileOf(moves) {
    if (moves === undefined) {
      return undefined;
    }
    const file = path.join(temporaryRoot('nitpicker-facts-moves-'), 'moves.json');
    writeFileSync(file, JSON.stringify(moves));
    return file;
  }

  function factsOf(files, { base, moves } = {}) {
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
    expect(JSON.parse(readFileSync(path.join(reportRoot, FACTS_REPORT), 'utf8'))).toEqual(report);
    const baselineMovesFile = movesFileOf(moves);
    return { ...report, findings: () => readFactFindings(reportRoot, { baselineMovesFile }) };
  }

  function cleanup() {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  return { factsOf, cleanup };
}
