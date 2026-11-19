import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectWideReport } from '../../../builds/project-wide.mts';

const JAVA = [
  'package shop;',
  'class Poller {',
  '  private static final long RETRY_DELAY_MS = 2000L;',
  '  public void poll() throws InterruptedException {',
  '    Thread.sleep(RETRY_DELAY_MS);',
  '  }',
  '}',
  '',
].join('\n');

const KOTLIN = [
  'package shop',
  'private const val RETRY_DELAY = 2000L',
  'suspend fun poll() {',
  '  delay(RETRY_DELAY)',
  '}',
  '',
].join('\n');

describe('the project-wide report', () => {
  it('includes the fixed delay of a Java and a Kotlin module', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-delay-wide-'));
    try {
      mkdirSync(path.join(root, 'src/main/java/shop'), { recursive: true });
      mkdirSync(path.join(root, 'src/main/kotlin/shop'), { recursive: true });
      writeFileSync(path.join(root, 'src/main/java/shop/Poller.java'), JAVA);
      writeFileSync(path.join(root, 'src/main/kotlin/shop/Poller.kt'), KOTLIN);
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
          .filter(({ rule }) => rule === 'UninjectableDelay')
          .map(({ path: file, location }) => `${file}:${String(location?.line)}`)
          .sort(),
      ).toEqual(['src/main/java/shop/Poller.java:5', 'src/main/kotlin/shop/Poller.kt:4']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
