import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
import { readCpdFindings } from '../cpd-duplicates.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const report = () => '<?xml version="1.0"?>\n<pmd-cpd>\n</pmd-cpd>\n';

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cpd-'));
  roots.push(root);
  const reportRoot = path.join(root, 'build/nitpicker');
  mkdirSync(reportRoot, { recursive: true });
  return { root, reportRoot };
}

const options = (root) => ({ projectRoot: root, testRoots: ['src/test/java'] });

describe('readCpdFindings without a usable CPD run', () => {
  const NPE =
    '[main] ERROR net.sourceforge.pmd.cli - Exception while running CPD: Cannot invoke ' +
    '"String.equals(Object)" because "java.util.Deque.peek().name" is null';

  const moduleRoots = { sourceRoots: ['core/src/main/java'], testRoots: ['core/src/test/java'] };

  function notRun(reason) {
    return [
      {
        tool: 'duplicates',
        rule: 'cpd-not-run',
        path: '.',
        identity: 'cpd-not-run',
        message:
          'No CPD duplicate report for this module, so duplicated code in core/src/main/java, ' +
          `core/src/test/java was not checked: ${reason}`,
        classification: 'descriptive',
        toolNotRun: true,
        notRunScope: ['core/src/main/java', 'core/src/test/java'],
      },
    ];
  }

  it.each([
    [
      'a crash that exited 0',
      `0\nPicked up JAVA_TOOL_OPTIONS: -Dx=y\n${NPE}\n`,
      `PMD CPD exited with code 0 and wrote no report: ${NPE}`,
    ],
    [
      'a failure without error output',
      '1\n',
      'PMD CPD exited with code 1 and wrote no report: no error output',
    ],
    [
      'a launcher that timed out',
      'ETIMEDOUT\nspawnSync java ETIMEDOUT',
      'PMD CPD did not finish within the tool timeout and wrote no report: spawnSync java ETIMEDOUT',
    ],
    [
      'a launcher killed by a signal',
      'SIGKILL\n',
      'PMD CPD was stopped by SIGKILL and wrote no report: no error output',
    ],
    [
      'a java that could not start',
      'EACCES\nspawnSync /jdk/bin/java EACCES',
      'PMD CPD could not run (EACCES) and wrote no report: spawnSync /jdk/bin/java EACCES',
    ],
  ])('reports %s as CPD not run, naming the exit code and stderr', (_, failure, reason) => {
    const { root, reportRoot } = project();
    writeFileSync(path.join(reportRoot, 'cpd-failed.txt'), failure);

    const findings = readCpdFindings(reportRoot, { projectRoot: root, ...moduleRoots });

    expect(findings).toEqual(notRun(reason));
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it.each([
    ['', 'PMD CPD wrote an empty cpd.xml'],
    ['  \n', 'PMD CPD wrote an empty cpd.xml'],
    ['Exception in thread "main"', 'PMD CPD wrote a non-XML cpd.xml'],
  ])('reports a cpd.xml of %j as CPD not run', (content, reason) => {
    const { root, reportRoot } = project();
    writeFileSync(path.join(reportRoot, 'cpd.xml'), content);

    expect(readCpdFindings(reportRoot, { projectRoot: root, ...moduleRoots })).toEqual(
      notRun(reason),
    );
  });

  it('reports the paths CPD could not read next to its clones', () => {
    const { root, reportRoot } = project();
    writeFileSync(path.join(reportRoot, 'cpd.xml'), report());
    writeFileSync(
      path.join(reportRoot, 'cpd-skipped.txt'),
      `${path.join(root, 'src/main/java/loop')}: symbolic link loop\n` +
        `${path.join(root, 'src/test/java')}: java.nio.file.NoSuchFileException\n`,
    );

    const findings = readCpdFindings(reportRoot, options(root));

    expect(findings).toEqual([
      {
        tool: 'duplicates',
        rule: 'cpd-skipped-paths',
        path: '.',
        identity: 'cpd-skipped-paths',
        message:
          'CPD could not read 2 path(s), so duplicated code there was not checked: ' +
          'src/main/java/loop: symbolic link loop; src/test/java: java.nio.file.NoSuchFileException',
        classification: 'descriptive',
      },
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('scopes a notice whose source roots lie outside the project to the module folder', () => {
    const { root, reportRoot } = project();
    writeFileSync(path.join(reportRoot, 'cpd-failed.txt'), '1\n');

    expect(
      readCpdFindings(reportRoot, {
        projectRoot: root,
        sourceRoots: ['../shared/src/main/java'],
        testRoots: [],
        moduleDir: 'app',
      }).map(({ notRunScope }) => notRunScope),
    ).toEqual([['app']]);
  });

  it('reports nothing when CPD did not run on the module', () => {
    const { root, reportRoot } = project();

    expect(readCpdFindings(reportRoot, options(root))).toEqual([]);
  });

  it('scopes a module whose sources sit at its root to the whole module', () => {
    const { root, reportRoot } = project();
    writeFileSync(path.join(reportRoot, 'cpd-failed.txt'), '1\n');

    expect(
      readCpdFindings(reportRoot, { projectRoot: root, sourceRoots: [''], testRoots: [''] }).map(
        ({ message, notRunScope }) => [message, notRunScope],
      ),
    ).toEqual([
      [
        'No CPD duplicate report for this module, so duplicated code in the module root was not ' +
          'checked: PMD CPD exited with code 1 and wrote no report: no error output',
        ['.'],
      ],
    ]);
  });
});
