import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectBuildTool } from './build-tool.mjs';

const roots = [];

function project(...files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-build-tool-'));
  roots.push(root);
  for (const name of files) {
    writeFileSync(path.join(root, name), '');
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('detectBuildTool', () => {
  it('chooses Maven for a pom.xml without any Gradle build file', () => {
    expect(detectBuildTool(project('pom.xml'))).toBe('maven');
  });

  it.each(['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'])(
    'keeps Gradle when %s is next to the pom.xml',
    (gradleFile) => {
      expect(detectBuildTool(project('pom.xml', gradleFile))).toBe('gradle');
    },
  );

  it('keeps Gradle for a directory with no build file, so its own error is reported', () => {
    expect(detectBuildTool(project())).toBe('gradle');
  });
});
