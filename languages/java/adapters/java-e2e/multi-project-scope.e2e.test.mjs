import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runJavaDiff } from '../java-diff.mjs';
import { commitBranch, runGitIn } from '../test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.join(import.meta.dirname, '..', 'fixtures', 'multi-project');
const GREETER = 'app/src/main/java/demo/app/Greeter.java';
const COUNTER = 'lib/src/main/java/demo/lib/Counter.java';

describe.skipIf(!enabled)('a Gradle change in the one project nothing else depends on', () => {
  let root;
  let result;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-multi-scope-'));
    cpSync(fixture, root, { recursive: true });
    writeFileSync(path.join(root, '.gitignore'), 'build/\n.gradle/\n');
    runGitIn(root, 'init', '-q', '-b', 'main');
    runGitIn(root, 'add', '-A');
    runGitIn(root, 'commit', '-q', '-m', 'main');
    const greeter = readFileSync(path.join(root, GREETER), 'utf8');
    commitBranch(root, 'feature', {
      [GREETER]: greeter.replace(
        'private Greeter() {}',
        'private int unused;\n\n  private Greeter() {}',
      ),
    });
    result = runJavaDiff({
      repositoryRoot: root,
      requestedBaseRef: 'main',
      gradle,
      policy: { preset: 'java' },
    });
  }, 300_000);

  afterAll(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports the new finding of the changed project', () => {
    expect(
      result.newEnforceable.map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
    ).toEqual([`pmd UnusedPrivateField ${GREETER}`]);
  });

  it('builds, tests and analyzes only the changed project and says which one it left out', () => {
    const files = result.newFindings.map(({ path: file }) => file);
    const notes = result.newFindings.filter(({ rule }) => rule === 'modules-not-affected');

    expect(files.filter((file) => file.startsWith('lib/') && file !== COUNTER)).toEqual([]);
    expect(notes.map(({ message }) => message)).toEqual(['modules not affected: lib']);
  });
});
