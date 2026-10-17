import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJavaFindings as readFindings } from './java-reports.mjs';
import {
  readingFrom,
  reportBaseOf,
  rootReports,
  writeModules,
} from '../test-support/report-base.mjs';

const readJavaFindings = readingFrom(readFindings);
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function emptyProject() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-spring-')));
  roots.push(root);
  mkdirSync(rootReports(root), { recursive: true });
  writeModules(root);
  const reports = rootReports(root);
  const sarif = (name) =>
    JSON.stringify({ runs: [{ tool: { driver: { name, rules: [] } }, results: [] }] });
  writeFileSync(path.join(reports, 'jacoco.xml'), '<report name="demo"></report>');
  writeFileSync(path.join(reports, 'pmd.sarif'), sarif('PMD'));
  writeFileSync(path.join(reports, 'spotbugs.sarif'), sarif('SpotBugs'));
  writeFileSync(path.join(reports, 'format.txt'), '');
  writeFileSync(path.join(reports, 'checkstyle.xml'), '<checkstyle></checkstyle>');
  writeFileSync(path.join(reports, 'structure.json'), '[]');
  writeFileSync(path.join(reportBaseOf(root), 'duplicates.json'), JSON.stringify({ runs: [] }));
  return root;
}

function qaProfileProject() {
  const root = emptyProject();
  mkdirSync(path.join(root, 'src/main/resources'), { recursive: true });
  mkdirSync(path.join(root, 'src/test/java'), { recursive: true });
  writeFileSync(
    path.join(root, 'src/main/resources/application.yml'),
    'spring:\n  config:\n    activate:\n      on-profile: qa\n  jpa:\n    hibernate:\n      ddl-auto: create-drop\n',
  );
  writeFileSync(
    path.join(root, 'src/test/java/EnvTest.java'),
    '@ActiveProfiles("qa")\nclass EnvTest {}\n',
  );
  writeFileSync(
    path.join(rootReports(root), 'manifest.json'),
    JSON.stringify({ sourceRoots: [], spring: true, testSourceRoots: ['src/test/java'] }),
  );
  return root;
}

describe('readJavaFindings: Spring test profiles', () => {
  const springFiles = (findings) =>
    findings.filter(({ tool }) => tool === 'spring').map(({ rule, path: file }) => [rule, file]);

  it('measures the profiles the tests use on the baseline checkout only for the head snapshot', () => {
    const root = qaProfileProject();
    const baselineRoot = emptyProject();
    const read = (baseline) => springFiles(readJavaFindings(root, { baseline }).findings);

    expect(read(undefined)).toEqual([]);
    expect(read({ snapshot: 'base', baselineRoot })).toEqual([]);
    expect(read({ snapshot: 'head', baselineRoot })).toEqual([
      ['ddl-auto', 'src/main/resources/application.yml'],
    ]);
  });
});
