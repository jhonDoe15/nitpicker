import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { uncheckedLanguageNotices } from './unchecked-languages.mts';

const roots = [];

function projectRoot(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'unchecked-languages-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function notices(changedFiles, { preset, root = projectRoot({}), exclude = [] }) {
  return uncheckedLanguageNotices(changedFiles, { preset, projectRoot: root, exclude });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('uncheckedLanguageNotices', () => {
  it('names a TypeScript folder of a Gradle build and the projects entry that checks it', () => {
    const root = projectRoot({ 'build.gradle': '', 'frontend/package.json': '{}' });

    expect(notices(['frontend/src/index.ts'], { preset: 'java', root })).toEqual([
      '1 changed TypeScript file is in a language the java preset does not check, so nothing checks it: ' +
        'frontend/src/index.ts. To check it, list that folder in "projects" of nitpicker.config.json, ' +
        'for example "projects": [".", "frontend"]; to leave it unchecked, list it in "exclude" in nitpicker.config.json.',
    ]);
  });

  it('leaves out the projects advice when the files have no project folder of their own', () => {
    const root = projectRoot({ 'pom.xml': '', 'package.json': '{}' });
    const files = ['src/main/webapp/app/a.ts', 'src/main/webapp/app/b.tsx'];

    expect(notices(files, { preset: 'java', root })).toEqual([
      '2 changed TypeScript files are in a language the java preset does not check, so nothing checks them: ' +
        'src/main/webapp/app/a.ts, src/main/webapp/app/b.tsx. ' +
        'To leave them unchecked, list them in "exclude" in nitpicker.config.json.',
    ]);
  });

  it.each([
    ['python', 'python'],
    ['typescript', 'typescript'],
    [undefined, 'typescript'],
  ])('describes a Java file in a %s project', (preset, named) => {
    const root = projectRoot({ 'tools/pom.xml': '' });

    expect(notices(['tools/src/main/java/A.java'], { preset, root })).toEqual([
      `1 changed Java file is in a language the ${named} preset does not check, ` +
        'so nothing checks it: tools/src/main/java/A.java. To check it, list that folder in "projects" ' +
        'of nitpicker.config.json, for example "projects": [".", "tools"]; ' +
        'to leave it unchecked, list it in "exclude" in nitpicker.config.json.',
    ]);
  });

  it.each([
    ['typescript', ['a.ts', 'b.tsx', 'c.js', 'd.mjs'], ['e.py', 'f.java', 'g.kt', 'h.go']],
    ['javascript', ['a.ts', 'c.js', 'd.cjs', 'e.jsx'], ['e.py', 'f.java', 'g.kt', 'h.go']],
    ['python', ['e.py'], ['a.ts', 'c.js', 'f.java', 'g.kt', 'h.go']],
    ['java', ['f.java'], ['a.ts', 'c.js', 'e.py', 'g.kt', 'h.go']],
    ['kotlin', ['f.java', 'g.kt', 'i.kts'], ['a.ts', 'c.js', 'e.py', 'h.go']],
    ['go', ['h.go'], ['a.ts', 'c.js', 'e.py', 'f.java', 'g.kt']],
  ])('the %s preset names only the languages it does not check', (preset, checked, unchecked) => {
    expect(notices(checked, { preset })).toEqual([]);
    expect(notices(unchecked, { preset })).toHaveLength(unchecked.length);
  });

  it('stays silent for excluded, generated, build output and tool files', () => {
    const quiet = [
      'scripts/tool.ts',
      'node_modules/x/index.js',
      'frontend/dist/app.js',
      'target/generated-sources/A.ts',
      '.github/scripts/a.js',
      'src/api.generated.ts',
      'types/index.d.ts',
      'webpack.config.js',
      'build.gradle.kts',
      'proto/msg_pb2.py',
      'setup.py',
      'test/fixtures/sample.py',
    ];

    expect(notices(quiet, { preset: 'java', exclude: ['scripts/**'] })).toEqual([]);
  });

  it('lists three files and counts the rest', () => {
    const files = ['a/1.py', 'a/2.py', 'a/3.py', 'a/4.py', 'a\\5.py'];

    expect(notices(files, { preset: 'go' })).toEqual([
      '5 changed Python files are in a language the go preset does not check, so nothing checks them: ' +
        'a/1.py, a/2.py, a/3.py, and 2 more. To leave them unchecked, list them in "exclude" in nitpicker.config.json.',
    ]);
  });
});
