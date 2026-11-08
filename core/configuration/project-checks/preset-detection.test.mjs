import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-preset-detection-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function message(files) {
  try {
    loadConfig(project(files));
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function expected(kind, marker, preset) {
  return (
    `nitpicker.config.json: no "preset" is set, so the TypeScript preset would run, but this is a ${kind} ` +
    `project (${marker}) with no TypeScript or JavaScript sources under src. Add "preset": "${preset}" to ` +
    'nitpicker.config.json (create the file if there is none).'
  );
}

describe('a project without "preset"', () => {
  it('stops with the Java preset to set for a Gradle or Maven project', () => {
    expect(message({ 'build.gradle': '', 'src/main/java/App.java': 'class App {}' })).toBe(
      expected('Gradle or Maven', 'build.gradle', 'java'),
    );
    expect(message({ 'pom.xml': '<project/>', 'src/main/java/App.java': 'class App {}' })).toBe(
      expected('Gradle or Maven', 'pom.xml', 'java'),
    );
  });

  it('names the Kotlin preset when Kotlin sources outnumber Java ones', () => {
    const files = {
      'settings.gradle.kts': '',
      'app/src/main/kotlin/App.kt': '',
      'app/src/main/kotlin/Other.kt': '',
      'app/src/main/java/Legacy.java': '',
    };

    expect(message(files)).toBe(expected('Gradle or Maven', 'settings.gradle.kts', 'kotlin'));
  });

  it('names the Java preset for Java sources whose build uses the Kotlin DSL', () => {
    const files = {
      'settings.gradle.kts': '',
      'build.gradle.kts': 'plugins {\n    java\n}\n',
      'src/main/java/App.java': 'class App {}',
    };

    expect(message(files)).toBe(expected('Gradle or Maven', 'build.gradle.kts', 'java'));
  });

  it('stops with the Python preset for a Python project', () => {
    expect(message({ 'pyproject.toml': '', 'src/demo/app.py': '' })).toBe(
      expected('Python', 'pyproject.toml', 'python'),
    );
    expect(message({ 'requirements.txt': 'flask\n', 'app.py': '' })).toBe(
      expected('Python', 'requirements.txt', 'python'),
    );
  });

  it('runs the TypeScript preset when the source roots hold TypeScript or JavaScript', () => {
    expect(message({ 'pyproject.toml': '', 'src/index.ts': '' })).toBeUndefined();
    expect(message({ 'build.gradle': '', 'src/main/web/app.js': '' })).toBeUndefined();
    expect(message({ 'package.json': '{}', 'src/index.ts': '' })).toBeUndefined();
  });

  it('does not count bundled assets as TypeScript or JavaScript sources', () => {
    const spring = {
      'pom.xml': '',
      'src/main/java/demo/App.java': '',
      'src/main/resources/static/app.js': '',
      'src/main/webapp/js/legacy.js': '',
      'src/main/web/vendor.min.js': '',
    };

    expect(message(spring)).toBe(expected('Gradle or Maven', 'pom.xml', 'java'));
  });

  it('accepts an explicit preset and a project with no marker', () => {
    const config = { 'nitpicker.config.json': '{"preset":"java"}' };

    expect(message({ ...config, 'build.gradle': '' })).toBeUndefined();
    expect(message({ 'lib/index.ts': '' })).toBeUndefined();
  });

  it('looks in the configured source roots', () => {
    const files = {
      'nitpicker.config.json': '{"layout":{"sourceRoots":["web"]}}',
      'pyproject.toml': '',
      'web/index.ts': '',
    };

    expect(message(files)).toBeUndefined();
  });
});
