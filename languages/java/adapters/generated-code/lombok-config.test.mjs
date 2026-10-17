import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LIVE_CHECKOUT_NOTE, markLombokGeneratedCode } from './lombok-config.mjs';

const roots = [];

function scratch() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-lombok-config-')));
  roots.push(root);
  return root;
}

function populate(root, files) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const project = (files) => populate(scratch(), files);
const read = (root, file) => readFileSync(path.join(root, file), 'utf8');
const marked = (root) => markLombokGeneratedCode(root).written;
const SETTING = 'lombok.addLombokGeneratedAnnotation = true\n';
const LOMBOK_DEPENDENCY = "compileOnly 'org.projectlombok:lombok:1.18.36'\n";

describe('markLombokGeneratedCode', () => {
  afterAll(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('writes the setting into a new root lombok.config when a Gradle build uses Lombok', () => {
    const root = project({ 'build.gradle': LOMBOK_DEPENDENCY });

    expect(marked(root)).toEqual(['lombok.config']);
    expect(read(root, 'lombok.config')).toBe(SETTING);
  });

  it('finds Lombok in a pom, any version catalog, a build script of a module and buildSrc', () => {
    const roots_ = [
      project({ 'pom.xml': '<artifactId>lombok</artifactId>' }),
      project({ 'gradle/libs.versions.toml': 'lombok = "1.18.36"\n' }),
      project({ 'gradle/tools.toml': 'lombok = "1.18.36"\n' }),
      project({ 'app/build.gradle.kts': 'compileOnly(libs.lombok)\n' }),
      project({ 'buildSrc/src/main/kotlin/java-conventions.gradle.kts': 'compileOnly("lombok")' }),
    ];

    expect(roots_.map(marked)).toEqual(roots_.map(() => ['lombok.config']));
  });

  it('finds Lombok in the parent pom above a module and in a Lombok import of a source file', () => {
    const parent = project({
      'pom.xml': '<modules/><dependency><artifactId>lombok</artifactId></dependency>',
      'app/pom.xml': '<parent><artifactId>root</artifactId></parent>',
    });
    const imported = project({
      'build.gradle': "plugins { id 'java' }\n",
      'src/main/java/A.java': 'package a;\n\nimport lombok.Data;\n\n@Data class A {}\n',
    });

    expect(marked(path.join(parent, 'app'))).toEqual(['lombok.config']);
    expect(marked(imported)).toEqual(['lombok.config']);
  });

  it('does nothing in a project that does not use Lombok', () => {
    const root = project({
      'pom.xml': '<artifactId>junit</artifactId>',
      'src/A.java': 'class A { String lombokLike; }',
    });

    expect(marked(root)).toEqual([]);
    expect(() => read(root, 'lombok.config')).toThrow();
  });

  it('appends to every existing lombok.config, also one that stops bubbling, and adds a root one', () => {
    const root = project({
      'build.gradle': "compileOnly 'org.projectlombok:lombok'\n",
      'api/lombok.config': 'config.stopBubbling = true',
      'api/src/lombok.config': 'lombok.accessors.fluent = true\n',
    });

    expect(marked(root).toSorted()).toEqual([
      'api/lombok.config',
      'api/src/lombok.config',
      'lombok.config',
    ]);
    expect(read(root, 'api/lombok.config')).toBe(`config.stopBubbling = true\n${SETTING}`);
    expect(read(root, 'api/src/lombok.config')).toBe(`lombok.accessors.fluent = true\n${SETTING}`);
    expect(read(root, 'lombok.config')).toBe(SETTING);
  });

  it('replaces a setting the project made, whether it turned it off or cleared it, and wins over a later one', () => {
    const root = project({
      'lombok.config':
        'lombok.addLombokGeneratedAnnotation = false\nlombok.val.flagUsage = warning\nclear lombok.addLombokGeneratedAnnotation\n',
      'sub/lombok.config':
        '# lombok.addLombokGeneratedAnnotation = false\nclear lombok.addLombokGeneratedAnnotation\n',
    });

    marked(root);

    expect(read(root, 'lombok.config')).toBe(`lombok.val.flagUsage = warning\n${SETTING}`);
    expect(read(root, 'sub/lombok.config')).toBe(
      `# lombok.addLombokGeneratedAnnotation = false\n${SETTING}`,
    );
  });

  it('keeps Windows line endings of the file it edits', () => {
    const root = project({
      'build.gradle': LOMBOK_DEPENDENCY,
      'lombok.config':
        'config.stopBubbling = true\r\nlombok.addLombokGeneratedAnnotation = false\r\n',
    });

    marked(root);

    expect(read(root, 'lombok.config')).toBe(
      'config.stopBubbling = true\r\nlombok.addLombokGeneratedAnnotation = true\r\n',
    );
  });

  it('leaves every build output and tool folder alone', () => {
    const skipped = ['.gradle', '.idea', 'build', 'node_modules', 'target'];
    const root = project({
      'build.gradle': LOMBOK_DEPENDENCY,
      ...Object.fromEntries(skipped.map((name) => [`${name}/lombok.config`, 'a = b\n'])),
    });

    expect(marked(root)).toEqual(['lombok.config']);
    for (const name of skipped) {
      expect(read(root, `${name}/lombok.config`)).toBe('a = b\n');
    }
  });

  it('still edits a lombok.config in a Java package that happens to be called build or target', () => {
    const root = project({
      'build.gradle': LOMBOK_DEPENDENCY,
      'src/main/java/shop/build/lombok.config': 'a = b\n',
      'src/main/java/shop/target/lombok.config': 'a = b\n',
    });

    expect(marked(root).toSorted()).toEqual([
      'lombok.config',
      'src/main/java/shop/build/lombok.config',
      'src/main/java/shop/target/lombok.config',
    ]);
  });

  it('never writes through a symlinked lombok.config: the link becomes a regular file with the target text', () => {
    const outside = project({ 'shared/lombok.config': 'config.stopBubbling = true\n' });
    const root = project({ 'build.gradle': LOMBOK_DEPENDENCY, 'real/lombok.config': 'a = b\n' });
    symlinkSync(path.join(outside, 'shared/lombok.config'), path.join(root, 'lombok.config'));
    mkdirSync(path.join(root, 'sub'));
    symlinkSync(path.join(root, 'real/lombok.config'), path.join(root, 'sub/lombok.config'));

    marked(root);

    expect(lstatSync(path.join(root, 'lombok.config')).isSymbolicLink()).toBe(false);
    expect(read(root, 'lombok.config')).toBe(`config.stopBubbling = true\n${SETTING}`);
    expect(read(outside, 'shared/lombok.config')).toBe('config.stopBubbling = true\n');
    expect(lstatSync(path.join(root, 'sub/lombok.config')).isSymbolicLink()).toBe(false);
    expect(read(root, 'sub/lombok.config')).toBe(`a = b\n${SETTING}`);
    expect(read(root, 'real/lombok.config')).toBe(`a = b\n${SETTING}`);
  });

  it('replaces a dangling symlinked lombok.config with a regular file holding only the setting', () => {
    const root = project({ 'build.gradle': LOMBOK_DEPENDENCY });
    symlinkSync(path.join(root, 'missing/lombok.config'), path.join(root, 'lombok.config'));

    marked(root);

    expect(lstatSync(path.join(root, 'lombok.config')).isSymbolicLink()).toBe(false);
    expect(read(root, 'lombok.config')).toBe(SETTING);
  });

  it('refuses to edit a live checkout, whose .git is a directory, or a folder inside one', () => {
    const root = project({ 'build.gradle': LOMBOK_DEPENDENCY, '.git/HEAD': 'ref: x\n' });
    const inside = path.join(root, 'module');
    populate(root, { 'module/build.gradle': LOMBOK_DEPENDENCY });

    expect(markLombokGeneratedCode(root)).toEqual({ written: [], note: LIVE_CHECKOUT_NOTE });
    expect(markLombokGeneratedCode(inside).written).toEqual([]);
    expect(() => read(root, 'lombok.config')).toThrow();
  });

  it('edits a linked worktree snapshot, whose .git is a file', () => {
    const root = project({ 'build.gradle': LOMBOK_DEPENDENCY, '.git': 'gitdir: /elsewhere\n' });

    expect(marked(root)).toEqual(['lombok.config']);
  });
});
