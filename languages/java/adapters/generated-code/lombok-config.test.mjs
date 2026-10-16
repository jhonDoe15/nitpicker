import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { markLombokGeneratedCode } from './lombok-config.mjs';

const roots = [];

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-lombok-config-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const read = (root, file) => readFileSync(path.join(root, file), 'utf8');
const SETTING = 'lombok.addLombokGeneratedAnnotation = true\n';

describe('markLombokGeneratedCode', () => {
  afterAll(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('writes the setting into a new root lombok.config when a Gradle build uses Lombok', () => {
    const root = project({
      'build.gradle': "dependencies { compileOnly 'org.projectlombok:lombok:1.18.36' }\n",
    });

    expect(markLombokGeneratedCode(root)).toEqual(['lombok.config']);
    expect(read(root, 'lombok.config')).toBe(SETTING);
  });

  it('finds Lombok in a Maven pom, a version catalog and a build script of a module', () => {
    const maven = project({ 'pom.xml': '<artifactId>lombok</artifactId>' });
    const catalog = project({ 'gradle/libs.versions.toml': 'lombok = "1.18.36"\n' });
    const module = project({ 'app/build.gradle.kts': 'compileOnly(libs.lombok)\n' });

    expect([maven, catalog, module].map(markLombokGeneratedCode)).toEqual([
      ['lombok.config'],
      ['lombok.config'],
      ['lombok.config'],
    ]);
  });

  it('does nothing in a project that does not use Lombok', () => {
    const root = project({
      'pom.xml': '<artifactId>junit</artifactId>',
      'src/A.java': 'class A {}',
    });

    expect(markLombokGeneratedCode(root)).toEqual([]);
    expect(() => read(root, 'lombok.config')).toThrow();
  });

  it('appends to every existing lombok.config, also one that stops bubbling, and adds a root one', () => {
    const root = project({
      'build.gradle': "compileOnly 'org.projectlombok:lombok'\n",
      'api/lombok.config': 'config.stopBubbling = true',
      'api/src/lombok.config': 'lombok.accessors.fluent = true\n',
    });

    expect(markLombokGeneratedCode(root).toSorted()).toEqual([
      'api/lombok.config',
      'api/src/lombok.config',
      'lombok.config',
    ]);
    expect(read(root, 'api/lombok.config')).toBe(`config.stopBubbling = true\n${SETTING}`);
    expect(read(root, 'api/src/lombok.config')).toBe(`lombok.accessors.fluent = true\n${SETTING}`);
    expect(read(root, 'lombok.config')).toBe(SETTING);
  });

  it('replaces a setting the project made, whether it turned it off or cleared it', () => {
    const root = project({
      'lombok.config':
        'lombok.addLombokGeneratedAnnotation = false\nlombok.val.flagUsage = warning\n',
      'sub/lombok.config': 'clear lombok.addLombokGeneratedAnnotation\n',
    });

    markLombokGeneratedCode(root);

    expect(read(root, 'lombok.config')).toBe(`${SETTING.trim()}\nlombok.val.flagUsage = warning\n`);
    expect(read(root, 'sub/lombok.config')).toBe(SETTING);
  });

  it('leaves build output and tool folders alone', () => {
    const root = project({
      'build.gradle': "compileOnly 'org.projectlombok:lombok'\n",
      'build/lombok.config': 'a = b\n',
      'node_modules/x/lombok.config': 'a = b\n',
    });

    expect(markLombokGeneratedCode(root)).toEqual(['lombok.config']);
    expect(read(root, 'build/lombok.config')).toBe('a = b\n');
  });
});
