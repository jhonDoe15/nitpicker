import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree } from '../../../../../core/fix/run-fix.mts';
import { patchChecks } from '../checks/error-prone-checks.mjs';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';
import { fakeErrorPronePatch, patchChecksOf } from '../../test-support/fake-error-prone-patch.mjs';
import { fakeJvmTools } from '../../test-support/fake-jvm-tools.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();
const JAVA = 'src/main/java/demo';
const GRADLE = { 'build.gradle': "plugins { id 'java' }\n" };
const ENVIRONMENT = { NITPICKER_GRADLE: '', NITPICKER_MAVEN: 'fake-mvn' };

const CLASS = (name) => `package demo;

public class ${name} {
  static class Base {
    void run() {}
  }

  static class Child extends Base {
    void run() {}
  }

  class Inner {
    int one() {
      return 1;
    }
  }
}
`;

const OVERRIDE_PATCH = (file) => `--- ${file}
+++ ${file}
@@ -7,5 +7,5 @@
 
   static class Child extends Base {
-    void run() {}
+    @Override void run() {}
   }
 
`;

const INNER_PATCH = (file) => `--- ${file}
+++ ${file}
@@ -10,5 +10,5 @@
   }
 
-  class Inner {
+  static class Inner {
     int one() {
       return 1;
`;

const BASE_CHANGED = CLASS('Changed')
  .replace('extends Base {\n    void run() {}', 'extends Base {\n    void run() { }')
  .replace('  class Inner {', '  class  Inner {');

afterEach(() => {
  vi.unstubAllEnvs();
});

function topic(changes, build = GRADLE) {
  vi.stubEnv('XDG_CACHE_HOME', temporaryRoot('nitpicker-fix-cache-'));
  const repository = createGitRepository(
    {
      ...build,
      [`${JAVA}/Changed.java`]: BASE_CHANGED,
      [`${JAVA}/Untouched.java`]: CLASS('Untouched'),
    },
    { baseRef: 'base' },
  );
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changes);
  return repository;
}

function patchBoth(patches) {
  return (cwd, directory, checks) =>
    ['Changed', 'Untouched']
      .flatMap((name) =>
        patches
          .filter(([check]) => checks.includes(check))
          .map(([, patch]) =>
            patch(path.relative(directory, path.join(cwd, JAVA, `${name}.java`))),
          ),
      )
      .join('');
}

function fix(
  repository,
  tools,
  { selectedRules, config = { preset: 'java' }, headPolicy = {} } = {},
) {
  return fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    executeFixCommand: tools.executeFixCommand,
    headPolicy: { exclude: [], conventions: { 'java.formatter': 'none' }, ...headPolicy },
    config,
    environment: ENVIRONMENT,
    selectedRules,
  });
}

function read(repository, name) {
  return readFileSync(path.join(repository.root, name), 'utf8');
}

function diagnosticsOf(entries) {
  return (cwd) =>
    ['Changed', 'Untouched'].flatMap((name) =>
      entries.map(([check, line]) => ({
        file: path.join(cwd, JAVA, `${name}.java`),
        line,
        message: `[${check}] message`,
      })),
    );
}

const DIAGNOSTICS = diagnosticsOf([
  ['MissingOverride', 9],
  ['ClassCanBeStatic', 12],
]);

const OVERRIDDEN = CLASS('Changed').replace(
  'extends Base {\n    void run() {}',
  'extends Base {\n    @Override void run() {}',
);
const STATIC_INNER = CLASS('Changed').replace('  class Inner {', '  static class Inner {');
const OVERRIDE = ['MissingOverride', OVERRIDE_PATCH];
const INNER = ['ClassCanBeStatic', INNER_PATCH];
const LIVE = { [`${JAVA}/Changed.java`]: CLASS('Changed') };

function toolsWith(patches, { failure } = {}) {
  return fakeJvmTools({
    failure,
    patch: fakeErrorPronePatch({ patch: patchBoth(patches), diagnostics: DIAGNOSTICS }),
  });
}

describe('--fix with Error Prone on Gradle', () => {
  it('fixes the changed file for the safe checks and leaves the untouched file as it was', () => {
    const repository = topic(LIVE);

    const result = fix(repository, toolsWith([OVERRIDE]));

    expect(read(repository, `${JAVA}/Changed.java`)).toBe(OVERRIDDEN);
    expect(read(repository, `${JAVA}/Untouched.java`)).toBe(CLASS('Untouched'));
    expect(result.fixedFiles).toEqual([`${JAVA}/Changed.java`]);
    expect(result.fixedFindings).toEqual([
      `${JAVA}/Changed.java:9 errorprone/MissingOverride (java-error-prone-safe)`,
    ]);
    expect(result.toolErrors).toEqual([]);
  });

  it('runs the init script task with the safe checks and a patch directory, never in place', () => {
    const repository = topic(LIVE);
    const tools = fakeJvmTools();

    fix(repository, tools);

    const [call] = tools.patchCalls;
    const at = call.args.indexOf('-I');

    expect(call.args.at(-1)).toBe('nitpickerErrorProne');
    expect(call.args.slice(at, at + 2)).toEqual(['-I', INIT_SCRIPT]);
    expect(patchChecksOf(call)).toEqual(patchChecks([]));
    expect(call.flags.some((flag) => flag.endsWith(':IN_PLACE'))).toBe(false);
    expect(call.flags.some((flag) => flag.startsWith('-XepPatchLocation:'))).toBe(true);
  });

  it('applies a review check only when the rule is selected, and then only that check', () => {
    const repository = topic(LIVE);
    const tools = toolsWith([INNER]);

    const plain = fix(repository, tools);
    const unchanged = read(repository, `${JAVA}/Changed.java`);
    const selected = fix(repository, tools, { selectedRules: ['errorprone/ClassCanBeStatic'] });

    expect(plain.fixedFindings).toEqual([]);
    expect(unchanged).toBe(CLASS('Changed'));
    expect(patchChecksOf(tools.patchCalls[1])).toEqual(['ClassCanBeStatic']);
    expect(read(repository, `${JAVA}/Changed.java`)).toBe(STATIC_INNER);
    expect(read(repository, `${JAVA}/Untouched.java`)).toBe(CLASS('Untouched'));
    expect(selected.fixedFindings).toEqual([
      `${JAVA}/Changed.java:12 errorprone/ClassCanBeStatic (java-error-prone-review)`,
    ]);
  });

  it('skips the compile when the selected rules are not Error Prone checks', () => {
    const tools = fakeJvmTools();

    fix(topic(LIVE), tools, { selectedRules: ['checkstyle/UpperEll'] });

    expect(tools.patchCalls).toEqual([]);
  });

  it('skips the compile when no Java file changed', () => {
    const tools = fakeJvmTools();

    fix(topic({ 'README.md': 'x\n' }), tools);

    expect(tools.patchCalls).toEqual([]);
  });

  it('reports a failed compile as a tool error', () => {
    const tools = toolsWith([OVERRIDE], {
      failure: { 'error-prone-patch': { status: 1, stdout: '', stderr: 'compilation failed' } },
    });

    const result = fix(topic(LIVE), tools);

    expect(result.toolErrors.map(({ tool }) => tool)).toEqual(['error-prone-fix']);
    expect(result.toolErrors[0].message).toMatch(
      /^error-prone-patch failed: compilation failed\. See \S+$/u,
    );
    expect(result.fixedFindings).toEqual([]);
  });

  it('leaves a hunk alone when the file no longer has its old lines', () => {
    const stale = (file) =>
      OVERRIDE_PATCH(file).replace('-    void run() {}', '-    void gone() {}');

    const result = fix(topic(LIVE), toolsWith([['MissingOverride', stale]]));

    expect(result.fixedFindings).toEqual([]);
  });

  it('keeps every hunk of a file that is new on this branch', () => {
    const repository = topic({ [`${JAVA}/Fresh.java`]: CLASS('Fresh') });
    const tools = fakeJvmTools({
      patch: fakeErrorPronePatch({
        patch: (cwd, directory) =>
          OVERRIDE_PATCH(path.relative(directory, path.join(cwd, JAVA, 'Fresh.java'))),
        diagnostics: (cwd) => [
          { file: path.join(cwd, JAVA, 'Fresh.java'), line: 9, message: '[MissingOverride] x' },
        ],
      }),
    });

    const result = fix(repository, tools);

    expect(result.fixedFiles).toEqual([`${JAVA}/Fresh.java`]);
  });

  it('keeps the settings of the gate: the declared Error Prone flags go with the patch flags', () => {
    const repository = topic(LIVE);
    writeFiles(repository.root, {
      'build.gradle': `plugins { id 'java'; id 'net.ltgt.errorprone' version '4.1.0' }
tasks.withType(JavaCompile).configureEach {
    options.errorprone {
        enable 'ReturnMissingNullable'
    }
}
`,
    });
    const tools = fakeJvmTools();

    fix(repository, tools, {
      headPolicy: { toolPrecedence: { errorprone: ['project'] } },
    });

    const [declared, checks, location] = tools.patchCalls[0].flags;

    expect([declared, checks]).toEqual([
      '-Xep:ReturnMissingNullable:WARN',
      `-XepPatchChecks:${patchChecks([]).join(',')}`,
    ]);
    expect(location).toMatch(/^-XepPatchLocation:\S+\/patches$/u);
  });
});

describe('--fix with Error Prone on Maven', () => {
  const MAVEN = { 'pom.xml': '<project/>\n' };

  it('fixes the changed file and leaves the untouched file as it was', () => {
    const repository = topic(LIVE, MAVEN);

    const result = fix(repository, toolsWith([OVERRIDE]));

    expect(read(repository, `${JAVA}/Changed.java`)).toBe(OVERRIDDEN);
    expect(read(repository, `${JAVA}/Untouched.java`)).toBe(CLASS('Untouched'));
    expect(result.fixedFindings).toEqual([
      `${JAVA}/Changed.java:9 errorprone/MissingOverride (java-error-prone-safe)`,
    ]);
    expect(result.toolErrors).toEqual([]);
  });

  it('applies a review check only when the rule is selected', () => {
    const repository = topic(LIVE, MAVEN);
    const tools = toolsWith([INNER]);

    const plain = fix(repository, tools);
    const selected = fix(repository, tools, { selectedRules: ['errorprone/ClassCanBeStatic'] });

    expect(plain.fixedFindings).toEqual([]);
    expect(selected.fixedFindings).toEqual([
      `${JAVA}/Changed.java:12 errorprone/ClassCanBeStatic (java-error-prone-review)`,
    ]);
  });

  it('reports a failed Maven run as a tool error', () => {
    const tools = toolsWith([OVERRIDE], {
      failure: { 'error-prone-patch': { status: 1, stdout: '', stderr: 'no compiler' } },
    });

    const result = fix(topic(LIVE, MAVEN), tools);

    expect(result.toolErrors.map(({ tool }) => tool)).toEqual(['error-prone-fix']);
  });
});
