import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from './gradle-guards.mjs';

const roots = [];
const JAVAC = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'javac') : 'javac';

beforeEach(() => {
  vi.stubEnv('JAVA_TOOL_OPTIONS', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function moduleWithPlan(root, key, plan) {
  const reportRoot = path.join(root, 'reports', key);
  mkdirSync(reportRoot, { recursive: true });
  if (plan !== undefined) {
    writeFileSync(path.join(reportRoot, 'guards-plan.json'), JSON.stringify(plan));
  }
  return { key, reportRoot };
}

describe('gradle-guards', () => {
  it('writes the permits and lint reports of a module that wrote a guards plan, and nothing without one', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-guards-'));
    roots.push(root);
    const basedir = path.join(root, 'app');
    const source = path.join(basedir, 'src/main/java/demo/A.java');
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, 'package demo;\nclass A {\n  java.util.List names;\n}\n');
    const lint = {
      root,
      basedir,
      reportRoot: root,
      sources: [source],
      generatedSources: [],
      classDirectory: path.join(basedir, 'build/classes/java/main'),
      classpath: [],
      processorPath: [],
      javac: JAVAC,
      compiler: { release: null, source: '17', target: '17', encoding: null, args: [] },
      workDirectory: path.join(basedir, 'build/nitpicker-lint/work'),
      cacheDirectory: path.join(basedir, 'build/nitpicker-lint'),
    };
    const planned = moduleWithPlan(root, 'module-app', { classDirectories: [], lint });
    const unplanned = moduleWithPlan(root, 'module-legacy', undefined);

    main([planned.reportRoot]);
    main([unplanned.reportRoot]);

    expect(readFileSync(path.join(planned.reportRoot, 'permits.txt'), 'utf8')).toBe('');
    expect(
      readFileSync(path.join(planned.reportRoot, 'javac-lint.txt'), 'utf8')
        .split('\n')
        .filter((line) => line.includes('warning: [rawtypes]')),
    ).toEqual(['app/src/main/java/demo/A.java:3: warning: [rawtypes] found raw type: List']);
    expect(existsSync(path.join(basedir, 'build/nitpicker-lint/javac-lint.txt'))).toBe(true);
    expect(existsSync(path.join(unplanned.reportRoot, 'permits.txt'))).toBe(false);
  });
});
