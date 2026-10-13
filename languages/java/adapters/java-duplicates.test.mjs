import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyFindingPolicy } from '../../../shared/finding-policy.mjs';
import { readDuplicateFindings, runJavaDuplicates } from './java-duplicates.mjs';
import { readKotlinDuplicateFindings, runKotlinDuplicates } from './kotlin-duplicates.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const BODY = [
  'public int run(int a, int b) {',
  '    int total = 0;',
  '    for (int i = 0; i < a; i++) {',
  '        if (i % 2 == 0 && b > 0) {',
  '            total += i * b;',
  '        } else {',
  '            total -= b;',
  '        }',
  '    }',
  '    return total;',
  '}',
].join('\n');

const KOTLIN_BODY = [
  'fun run(a: Int, b: Int): Int {',
  '    var total = 0',
  '    for (i in 0 until a) {',
  '        if (i % 2 == 0 && b > 0) {',
  '            total += i * b',
  '        } else {',
  '            total -= b',
  '        }',
  '    }',
  '    return total',
  '}',
].join('\n');

function imports(prefix, semicolon) {
  return ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta']
    .map((name) => `import ${prefix}.${name}${semicolon}`)
    .join('\n');
}

function javaFile(name, header, body) {
  return `package demo;\n\n${header}\n\nclass ${name} {\n${body}\n}\n`;
}

function project(files, manifest = { sourceRoots: ['src/main/java'] }) {
  const projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-duplicates-')));
  roots.push(projectRoot);
  mkdirSync(path.join(projectRoot, 'build/nitpicker'), { recursive: true });
  writeFileSync(path.join(projectRoot, 'build/nitpicker/manifest.json'), JSON.stringify(manifest));
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(projectRoot, relative)), { recursive: true });
    writeFileSync(path.join(projectRoot, relative), contents);
  }
  return projectRoot;
}

function clones(projectRoot, options) {
  runJavaDuplicates(projectRoot, options);
  return readDuplicateFindings(path.join(projectRoot, 'build/nitpicker')).filter(
    ({ rule }) => rule === 'duplicate-clone',
  );
}

describe('duplicates in Java sources', () => {
  it('does not report clones made only of package and import lines', () => {
    const header = imports('com.example.shared', ';');
    const projectRoot = project({
      'src/main/java/demo/One.java': javaFile('One', header, 'int one() { return 1; }'),
      'src/main/java/demo/Two.java': javaFile('Two', header, 'int two() { return 2; }'),
    });

    expect(clones(projectRoot)).toEqual([]);
  });

  it('still reports a clone that carries code after the imports', () => {
    const header = imports('com.example.shared', ';');
    const projectRoot = project({
      'src/main/java/demo/One.java': javaFile('One', header, BODY),
      'src/main/java/demo/Two.java': javaFile('Two', header, BODY),
    });

    expect(clones(projectRoot).map(({ path: file }) => file)).toEqual([
      'src/main/java/demo/One.java',
    ]);
  });

  it('names both files in the message, which tells to exclude either', () => {
    const projectRoot = project({
      'src/main/java/demo/One.java': javaFile('One', '', BODY),
      'src/main/java/demo/Two.java': javaFile('Two', '', BODY),
    });

    expect(clones(projectRoot).map(({ message }) => message)).toEqual([
      expect.stringMatching(
        /^This code repeats src\/main\/java\/demo\/Two\.java:\d+ \(\d+ lines\)\. Keep one copy and call it from both places\. If the repetition is intended, add src\/main\/java\/demo\/One\.java or src\/main\/java\/demo\/Two\.java to "exclude" in nitpicker\.config\.json\.$/,
      ),
    ]);
  });

  it('drops the clone when an exclude matches only the second file of the pair', () => {
    const projectRoot = project({
      'src/main/java/demo/One.java': javaFile('One', '', BODY),
      'src/main/java/demo/Two.java': javaFile('Two', '', BODY),
    });
    runJavaDuplicates(projectRoot);
    const found = readDuplicateFindings(path.join(projectRoot, 'build/nitpicker'));

    expect(found.length).toBeGreaterThan(0);
    expect(applyFindingPolicy(found, { exclude: ['src/main/java/demo/Two.java'] })).toEqual([]);
    expect(applyFindingPolicy(found, { exclude: ['src/main/java/demo/One.java'] })).toEqual([]);
    expect(applyFindingPolicy(found, { exclude: ['src/main/java/demo/Three.java'] })).toHaveLength(
      found.length,
    );
  });

  it('skips build and generated folders by default and analyses what the project keeps', () => {
    const projectRoot = project({
      'src/main/java/demo/build/One.java': javaFile('One', '', BODY),
      'src/main/java/demo/build/Two.java': javaFile('Two', '', BODY),
      'src/main/java/demo/generated/Three.java': javaFile('Three', '', BODY),
      'src/main/java/demo/generated/Four.java': javaFile('Four', '', BODY),
    });

    expect(clones(projectRoot)).toEqual([]);
    expect(
      clones(projectRoot, { skippedFolders: ['generated'] }).map(({ path: file }) => file),
    ).toEqual(['src/main/java/demo/build/One.java']);
  });
});

describe('duplicates in Kotlin sources', () => {
  const kotlinProject = (files) =>
    project(files, { sourceRoots: [], kotlinSourceRoots: ['src/main/kotlin'] });

  function kotlinClones(projectRoot, skippedFolders) {
    runKotlinDuplicates(projectRoot, skippedFolders);
    return readKotlinDuplicateFindings(path.join(projectRoot, 'build/nitpicker')).filter(
      ({ rule }) => rule === 'duplicate-clone',
    );
  }

  it('does not report clones made only of package and import lines', () => {
    const header = imports('com.example.shared', '');
    const projectRoot = kotlinProject({
      'src/main/kotlin/demo/One.kt': `package demo\n\n${header}\n\nfun one() = 1\n`,
      'src/main/kotlin/demo/Two.kt': `package demo\n\n${header}\n\nfun two() = 2\n`,
    });

    expect(kotlinClones(projectRoot)).toEqual([]);
  });

  it('reports a clone of code and honours the project folder list', () => {
    const projectRoot = kotlinProject({
      'src/main/kotlin/demo/build/One.kt': `package demo\n\n${KOTLIN_BODY}\n`,
      'src/main/kotlin/demo/build/Two.kt': `package demo\n\n${KOTLIN_BODY}\n`,
    });

    expect(kotlinClones(projectRoot)).toEqual([]);
    expect(kotlinClones(projectRoot, ['target']).map(({ path: file }) => file)).toEqual([
      'src/main/kotlin/demo/build/One.kt',
    ]);
  });
});
