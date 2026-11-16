import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectWideReport } from '../../../../builds/project-wide.mts';

const SOURCE = [
  'package shop;',
  'class Window {',
  '  int end(int start, int[] rows) {',
  '    return Math.min(start + Integer.MAX_VALUE, rows.length);',
  '  }',
  '}',
  '',
].join('\n');

describe('the project-wide report', () => {
  it('includes the max-value finding of a module', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-max-wide-'));
    try {
      mkdirSync(path.join(root, 'src/main/java/shop'), { recursive: true });
      writeFileSync(path.join(root, 'src/main/java/shop/Window.java'), SOURCE);
      const project = {
        reportRoot: path.join(root, 'reports'),
        qualifier: '',
        sourceRoots: ['src/main/java'],
        testSourceRoots: [],
        kotlinSourceRoots: [],
        kotlinTestSourceRoots: [],
      };
      const { findings } = projectWideReport(root, {
        projects: [project],
        mergedRoot: path.join(root, 'merged'),
        manifest: { sourceRoots: ['src/main/java'] },
        kotlin: false,
        policy: {},
      });

      expect(findings.map(({ rule, path: file }) => `${rule} ${file}`)).toEqual([
        'MaxValueOverflow src/main/java/shop/Window.java',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
