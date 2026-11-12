import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { archunitFindings } from './archunit-findings.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function failingReport(className) {
  return `<testsuite name="${className}"><testcase name="layersHold" classname="${className}"><failure message="x"/></testcase></testsuite>`;
}

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-archunit-findings-'));
  roots.push(root);
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

    expect(archunitFindings(options).map((finding) => finding.path)).toEqual([
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
