import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectWideReport } from '../../../builds/project-wide.mts';

const JAVA = [
  'package shop;',
  'class Files {',
  '  boolean inside(String pathname, String base) {',
  '    return pathname.startsWith(base);',
  '  }',
  '}',
  '',
].join('\n');

const KOTLIN = [
  'package shop',
  'class Hosts {',
  '  fun trusted(hostname: String, domain: String): Boolean {',
  '    return hostname.endsWith(domain)',
  '  }',
  '}',
  '',
].join('\n');

function report(root: string) {
  const project = {
    reportRoot: path.join(root, 'reports'),
    qualifier: '',
    sourceRoots: ['src/main/java'],
    testSourceRoots: [],
    kotlinSourceRoots: ['src/main/kotlin'],
    kotlinTestSourceRoots: [],
  };
  return projectWideReport(root, {
    projects: [project],
    mergedRoot: path.join(root, 'merged'),
    manifest: { sourceRoots: ['src/main/java'] },
    kotlin: true,
    policy: {},
  }).findings;
}

describe('the project-wide report', () => {
  it('includes the findings of the mined review rules for a Java and a Kotlin module', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-mined-wide-'));
    try {
      mkdirSync(path.join(root, 'src/main/java/shop'), { recursive: true });
      mkdirSync(path.join(root, 'src/main/kotlin/shop'), { recursive: true });
      writeFileSync(path.join(root, 'src/main/java/shop/Files.java'), JAVA);
      writeFileSync(path.join(root, 'src/main/kotlin/shop/Hosts.kt'), KOTLIN);

      expect(
        report(root)
          .filter(({ rule }) => rule === 'AffixWithoutBoundary')
          .map(({ path: file, location }) => `${file}:${String(location?.line)}`)
          .sort(),
      ).toEqual(['src/main/java/shop/Files.java:4', 'src/main/kotlin/shop/Hosts.kt:4']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
