import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { analyzeJavaSnapshot } from '../java-runner.mjs';

const roots = [];

function lombokProject(gitEntry) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-lombok-boundary-')));
  roots.push(root);
  writeFileSync(path.join(root, 'build.gradle'), "compileOnly 'org.projectlombok:lombok'\n");
  if (gitEntry !== undefined) {
    writeFileSync(path.join(root, '.git'), gitEntry);
  }
  return root;
}

const unavailableGradle = path.join(tmpdir(), 'nitpicker-no-such-gradle');

describe('where nitpicker edits lombok.config', () => {
  afterAll(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('does not touch the project when findings are collected directly', () => {
    const root = lombokProject();

    expect(() => collectJavaFindings(root, { gradle: unavailableGradle, policy: {} })).toThrow();
    expect(existsSync(path.join(root, 'lombok.config'))).toBe(false);
  });

  it('marks the snapshot it is asked to analyse, even when the analysis then fails', () => {
    const root = lombokProject('gitdir: /elsewhere\n');

    const { findings } = analyzeJavaSnapshot(root, { gradle: unavailableGradle, policy: {} });

    expect(findings.map(({ classification }) => classification)).toEqual(['tool-error']);
    expect(existsSync(path.join(root, 'lombok.config'))).toBe(true);
  });
});
