import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJavaFindings as readFindings } from '../reporting/java-reports.mjs';
import { readingFrom, reportBaseOf, writeModules } from '../test-support/report-base.mjs';

const readJavaFindings = readingFrom(readFindings);

const legacy = 'src/main/java/demo/Legacy.java';
const EMPTY_SARIF = JSON.stringify({ version: '2.1.0', runs: [] });
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function kotlinProject() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-classes-')));
  roots.push(root);
  const reports = writeModules(root);
  writeFileSync(path.join(reportBaseOf(root), 'duplicates.json'), JSON.stringify({ runs: [] }));
  mkdirSync(path.dirname(path.join(root, legacy)), { recursive: true });
  writeFileSync(path.join(root, legacy), 'package demo;\n\nclass Legacy {}\n');
  const files = {
    'manifest.json': JSON.stringify({
      versions: {},
      sourceRoots: ['src/main/java'],
      kotlin: true,
      kotlinSourceRoots: ['src/main/java'],
      kotlinFormatter: 'none',
    }),
    'pmd.sarif': EMPTY_SARIF,
    'spotbugs.sarif': EMPTY_SARIF,
    'detekt.sarif': EMPTY_SARIF,
    'format.txt': '',
    'checkstyle.xml': '<checkstyle version="10.21.1"></checkstyle>',
    'jacoco.xml': '<report name="demo"></report>',
    'structure.json': '[]',
    'classes.json': JSON.stringify({
      files: { [legacy]: { package: 'demo', imports: [] } },
      classes: [{ file: legacy, name: 'Legacy', kind: 'class', start: 3, methods: 3, fields: 0 }],
    }),
  };
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(reports, name), text);
  }
  return root;
}

describe('class limits read from the report of a project', () => {
  it('apply to its Java files', () => {
    const root = kotlinProject();
    const classRules = (fileLimits) =>
      readJavaFindings(root, { preset: 'kotlin', fileLimits })
        .findings.filter(({ rule }) => rule.startsWith('class-'))
        .map(({ rule, path: file }) => [rule, file]);

    expect(classRules({})).toEqual([]);
    expect(classRules({ classMethods: 2 })).toEqual([['class-methods-limit', legacy]]);
  });

  it('lifts a class rule for the paths of an exception', () => {
    const root = kotlinProject();
    const options = { preset: 'kotlin', fileLimits: { classMethods: 2 } };
    const lifted = [{ rule: 'class-methods-limit', paths: ['src/**'] }];

    expect(readJavaFindings(root, { ...options, exceptions: lifted }).findings).toEqual([]);
  });

  it('fails when the class report is missing, so a missing step cannot drop the limits', () => {
    const root = kotlinProject();
    rmSync(path.join(writeModules(root), 'classes.json'));

    expect(() => readJavaFindings(root, { preset: 'kotlin' })).toThrow(
      /The classes\.json report is missing from .*: the structure step \(StructureMetrics\.java\) did not write it/u,
    );
  });
});
