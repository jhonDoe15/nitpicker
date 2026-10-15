import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { javaFiles, nitpickerCheckstyleConfig } from './maven-lint.mjs';
import { readPinnedTools, toolDependencies } from './maven-tools.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('nitpickerCheckstyleConfig', () => {
  it('drops every inline suppression filter from the bundled Google checks', () => {
    const bundled = [
      '<module name="Checker">',
      '  <module name="SuppressWarningsFilter"/>',
      '  <module name="SuppressWithNearbyCommentFilter">',
      '    <property name="commentFormat" value="x"/>',
      '  </module>',
      '  <module name="TreeWalker"><module name="SuppressWarningsHolder" /></module>',
      '</module>',
    ].join('\n');

    const text = nitpickerCheckstyleConfig(bundled);

    expect(text).not.toMatch(/Suppress/u);
    expect(text).toContain('<module name="TreeWalker">');
  });
});

describe('javaFiles', () => {
  it('lists the Java files under existing roots, sorted', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-files-'));
    roots.push(root);
    for (const file of ['b/B.java', 'a/A.java', 'a/notes.txt', 'a/deep/C.java']) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), '');
    }

    expect(
      javaFiles([path.join(root, 'b'), path.join(root, 'a'), path.join(root, 'missing')]),
    ).toEqual(['a/A.java', 'a/deep/C.java', 'b/B.java'].map((file) => path.join(root, file)));
  });
});

describe('maven tools', () => {
  it('reads the versions pinned in the Gradle init script', () => {
    const pinned = readPinnedTools();

    expect(Object.keys(pinned)).toEqual(
      expect.arrayContaining([
        'pmd',
        'spotbugs',
        'googleJavaFormat',
        'jacoco',
        'checkstyle',
        'pitest',
        'pitestJunit5',
      ]),
    );
  });

  it('keeps the project JUnit Platform for PIT and adds a launcher per missing version', () => {
    const tools = toolDependencies(readPinnedTools(), ['1.11.4']);

    expect(tools.pit[1]).toContain(
      '<exclusion><groupId>org.junit.platform</groupId><artifactId>*</artifactId></exclusion>',
    );
    expect(tools['launcher-1.11.4']).toEqual([
      '<dependency><groupId>org.junit.platform</groupId><artifactId>junit-platform-launcher</artifactId><version>1.11.4</version></dependency>',
    ]);
    expect(tools.jacoco[0]).toContain('<classifier>nodeps</classifier>');
  });
});
