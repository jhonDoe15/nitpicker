import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { projectNames } from './reflected-names.mts';

const HERMETIC = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const GIT_TIMEOUT = 10_000;
const roots: string[] = [];
const template = mkdtempSync(path.join(tmpdir(), 'nitpicker-reflected-template-'));

beforeAll(() => {
  spawnSync('git', ['init', '-q'], { cwd: template, env: HERMETIC, timeout: GIT_TIMEOUT });
});

afterAll(() => {
  rmSync(template, { recursive: true, force: true });
});

function project(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-reflected-'));
  roots.push(root);
  cpSync(template, root, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('inProjectStrings', () => {
  it('finds a name inside a string literal of a project file, tracked or not', () => {
    const { quoted } = projectNames(
      project({
        'Finder.java': 'class Finder { Object m = Finder.class.getDeclaredMethod("hidden"); }\n',
        'Loader.kt': 'val type = Class.forName("demo.Nested$Plugin")\n',
      }),
    );

    expect([quoted('hidden'), quoted('Plugin'), quoted('Nested')]).toEqual([true, true, true]);
  });

  it('searches the whole repository when the project is one of its modules', () => {
    const root = project({
      'app/src/Hidden.java': 'class Hidden { private void hidden() {} }\n',
      'tests/src/Finder.java': 'class Finder { String m = "hidden"; }\n',
      'tests/src/main/resources/META-INF/services/demo.Plugin': 'demo.Hidden$Plugin\n',
    });
    const { quoted } = projectNames(path.join(root, 'app'));

    expect(quoted('hidden')).toBe(true);
  });

  it('does not count a name that only appears as code or inside a longer word', () => {
    const { quoted } = projectNames(
      project({
        'Uses.java': 'class Uses { int hidden() { return 1; } String s = "hiddenness"; }\n',
      }),
    );

    expect(quoted('hidden')).toBe(false);
  });

  it('finds a class that a Java or Kotlin class extends', () => {
    const { extended } = projectNames(
      project({
        'Child.java': 'class Child extends demo.Helpers {}\n',
        'Other.kt': 'class Other : Base()\n',
        'Plain.java': 'class Plain { Helpers2 h; Tool t; }\n',
      }),
    );

    expect([extended('Helpers'), extended('Base'), extended('Tool')]).toEqual([true, true, false]);
  });

  it('treats every name as used when it cannot search the project', () => {
    const names = projectNames(undefined);

    expect([names.quoted('anything'), names.extended('anything')]).toEqual([true, true]);
  });
});
