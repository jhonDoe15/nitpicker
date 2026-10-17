import { describe, expect, it } from 'vitest';
import {
  commitHead,
  compare,
  createMoveRepositories,
  filler,
  finding,
  move,
  write,
} from './test-support/move-repositories.mjs';

const createRepository = createMoveRepositories();

describe('a tool that produced no report on one side', () => {
  const notRun = `// FINDING ${JSON.stringify({
    identity: 'not-run',
    rule: 'not-run',
    classification: 'descriptive',
    toolNotRun: true,
  })}\n`;

  it('fails the run as a tool error when only the head lacks the report', () => {
    const root = createRepository({
      'src/a.mjs': `${filler('a')}${finding('a-site')}`,
    });
    write(root, { 'src/a.mjs': `${filler('a')}${notRun}` });
    commitHead(root);

    const report = compare(root);

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.toolErrors).toEqual([
      {
        tool: 'probe',
        snapshot: 'head',
        rule: 'not-run',
        path: 'src/a.mjs',
        message: 'probe finding The base produced this probe report, so the change broke it.',
      },
    ]);
    expect(report.newFindings).toEqual([]);
  });

  it('reports the head findings without failing when only the base lacks the report', () => {
    const root = createRepository({ 'src/a.mjs': `${filler('a')}${notRun}` });
    write(root, { 'src/a.mjs': `${filler('a')}${finding('a-site')}` });
    commitHead(root);

    const report = compare(root);

    expect(report.toolErrors).toEqual([]);
    expect(report.newFindings).toEqual([
      {
        tool: 'probe',
        rule: 'probe-rule',
        path: 'src/a.mjs',
        identity: 'a-site',
        classification: 'descriptive',
        location: { line: 13, column: 1 },
        message:
          'probe finding Not enforced: no base probe report shows whether the change added it.',
      },
    ]);
  });

  const legacyNotRun = `// FINDING ${JSON.stringify({
    identity: 'not-run:legacy',
    rule: 'not-run',
    classification: 'descriptive',
    toolNotRun: true,
    notRunScope: ['src/legacy'],
  })}\n`;

  function classified(report) {
    return report.newFindings.map(
      ({ identity, classification }) => `${identity} ${classification}`,
    );
  }

  it('relaxes only the moved file when one file of a not-run folder moves into another', () => {
    const root = createRepository({
      'src/legacy/a.mjs': filler('a'),
      'src/legacy/b.mjs': filler('b'),
      'src/kernel/k.mjs': filler('k'),
      'src/notice.mjs': `${filler('n')}${legacyNotRun}`,
    });
    move(root, 'src/legacy/a.mjs', 'src/kernel/a.mjs');
    write(root, {
      'src/kernel/a.mjs': `${filler('a')}${finding('moved-site')}`,
      'src/kernel/k.mjs': `${filler('k')}${finding('kernel-site')}`,
    });
    commitHead(root);

    expect(classified(compare(root))).toEqual([
      'moved-site descriptive',
      'kernel-site enforceable',
    ]);
  });

  it('keeps an existing folder enforced when the whole not-run folder moves into it', () => {
    const root = createRepository({
      'src/legacy/a.mjs': filler('a'),
      'src/legacy/b.mjs': filler('b'),
      'src/kernel/k.mjs': filler('k'),
      'src/notice.mjs': `${filler('n')}${legacyNotRun}`,
    });
    move(root, 'src/legacy/a.mjs', 'src/kernel/a.mjs');
    move(root, 'src/legacy/b.mjs', 'src/kernel/b.mjs');
    write(root, {
      'src/kernel/a.mjs': `${filler('a')}${finding('moved-site')}`,
      'src/kernel/k.mjs': `${filler('k')}${finding('kernel-site')}`,
      'src/notice.mjs': filler('n'),
    });
    commitHead(root);

    expect(classified(compare(root))).toEqual([
      'moved-site descriptive',
      'kernel-site enforceable',
    ]);
  });

  it('keeps the folder of a subproject whose files partly leave the project', () => {
    const root = createRepository({
      'proj/src/legacy/a.mjs': filler('a'),
      'proj/src/legacy/b.mjs': filler('b'),
      'proj/src/legacy/c.mjs': filler('c'),
      'proj/src/legacy/keep.mjs': filler('keep'),
      'proj/src/notice.mjs': `${filler('n')}${legacyNotRun}`,
    });
    move(root, 'proj/src/legacy/a.mjs', 'other/src/legacy/a.mjs');
    move(root, 'proj/src/legacy/b.mjs', 'other/src/legacy/b.mjs');
    move(root, 'proj/src/legacy/c.mjs', 'proj/src/core/c.mjs');
    write(root, {
      'proj/src/core/c.mjs': `${filler('c')}${finding('moved-site')}`,
      'proj/src/legacy/keep.mjs': `${filler('keep')}${finding('keep-site')}`,
    });
    commitHead(root);

    expect(classified(compare(root, { projectRelativePath: 'proj' }))).toEqual([
      'moved-site descriptive',
      'keep-site descriptive',
    ]);
  });
});
