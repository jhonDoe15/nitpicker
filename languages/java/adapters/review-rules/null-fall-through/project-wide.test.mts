import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectWideReport } from '../../../builds/project-wide.mts';

const JAVA = [
  'package shop;',
  'class Writer {',
  '  void write(Object value, StringBuilder out) {',
  '    if (value == null) {',
  '      out.append("null");',
  '    }',
  '    out.append(value.toString());',
  '  }',
  '}',
  '',
].join('\n');

const KOTLIN = [
  'package shop',
  'class Notes {',
  '  fun write(value: String?, out: StringBuilder) {',
  '    if (value == null) {',
  '      out.append("null")',
  '    }',
  '    out.append(value!!.trim())',
  '  }',
  '}',
  '',
].join('\n');

describe('the project-wide report', () => {
  it('includes the null-branch finding of a Java and a Kotlin module', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-null-wide-'));
    try {
      mkdirSync(path.join(root, 'src/main/java/shop'), { recursive: true });
      mkdirSync(path.join(root, 'src/main/kotlin/shop'), { recursive: true });
      writeFileSync(path.join(root, 'src/main/java/shop/Writer.java'), JAVA);
      writeFileSync(path.join(root, 'src/main/kotlin/shop/Notes.kt'), KOTLIN);
      const project = {
        reportRoot: path.join(root, 'reports'),
        qualifier: '',
        sourceRoots: ['src/main/java'],
        testSourceRoots: [],
        kotlinSourceRoots: ['src/main/kotlin'],
        kotlinTestSourceRoots: [],
      };
      const { findings } = projectWideReport(root, {
        projects: [project],
        mergedRoot: path.join(root, 'merged'),
        manifest: { sourceRoots: ['src/main/java'] },
        kotlin: true,
        policy: {},
      });

      expect(
        findings
          .filter(({ rule }) => rule === 'NullBranchFallThrough')
          .map(({ path: file, location }) => `${file}:${String(location?.line)}`)
          .sort(),
      ).toEqual(['src/main/java/shop/Writer.java:4', 'src/main/kotlin/shop/Notes.kt:4']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
