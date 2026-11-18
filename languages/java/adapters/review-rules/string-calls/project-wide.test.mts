import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectWideReport } from '../../../builds/project-wide.mts';

const JAVA = [
  'package shop;',
  'class Globs {',
  '  java.util.regex.Pattern compile(String glob) {',
  '    return java.util.regex.Pattern.compile(glob.replace("**", ".*").replace("*", "[^/]*"));',
  '  }',
  '}',
  '',
].join('\n');

const KOTLIN = [
  'package shop',
  'class Likes {',
  '  fun like(glob: String): String =',
  '    glob.replace("*", "%").replace("?", "_")',
  '}',
  '',
].join('\n');

describe('the project-wide report', () => {
  it('includes the string-call findings of a Java and a Kotlin module', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-string-wide-'));
    try {
      mkdirSync(path.join(root, 'src/main/java/shop'), { recursive: true });
      mkdirSync(path.join(root, 'src/main/kotlin/shop'), { recursive: true });
      writeFileSync(path.join(root, 'src/main/java/shop/Globs.java'), JAVA);
      writeFileSync(path.join(root, 'src/main/kotlin/shop/Likes.kt'), KOTLIN);
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
          .filter(({ rule }) => rule === 'PatternTranslation')
          .map(({ path: file, location }) => `${file}:${String(location?.line)}`)
          .sort(),
      ).toEqual(['src/main/java/shop/Globs.java:4', 'src/main/kotlin/shop/Likes.kt:4']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
