import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { archunitFindings } from './archunit-findings.mts';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mts';

const { temporaryRoot } = useGitFixtures();

function failingReport(className: string): string {
  return `<testsuite name="${className}"><testcase name="layersHold" classname="${className}"><failure message="x"/></testcase></testsuite>`;
}

function project() {
  const root = temporaryRoot('nitpicker-archunit-findings-');
  const reportRoot = path.join(root, 'report');
  mkdirSync(path.join(reportRoot, 'archunit'), { recursive: true });
  mkdirSync(path.join(root, 'src/test/java/demo'), { recursive: true });
  for (const name of ['A', 'B']) {
    writeFileSync(path.join(root, `src/test/java/demo/${name}.java`), `class ${name} {}\n`);
  }
  return {
    reportRoot,
    options: { reportRoot, projectRoot: root, sourceRoots: ['src/test/java'], manifest: {} },
  };
}

describe('archunitFindings', () => {
  it('reads the reports in file name order, uppercase names first', () => {
    const { reportRoot, options } = project();
    writeFileSync(path.join(reportRoot, 'archunit', 'a.xml'), failingReport('demo.A'));
    writeFileSync(path.join(reportRoot, 'archunit', 'B.xml'), failingReport('demo.B'));

    expect(archunitFindings(options).map((finding) => fieldOf(finding, 'path'))).toEqual([
      'src/test/java/demo/B.java',
      'src/test/java/demo/A.java',
    ]);
  });

  it('refuses a report that is a link to a file outside its folder', () => {
    const { reportRoot, options } = project();
    const outside = path.join(path.dirname(reportRoot), 'outside.xml');
    writeFileSync(outside, failingReport('demo.A'));
    symlinkSync(outside, path.join(reportRoot, 'archunit', 'linked.xml'));

    expect(() => archunitFindings(options)).toThrow(/is outside/u);
  });
});
