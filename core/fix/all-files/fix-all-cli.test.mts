import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import { fakeAnalyzer, useCliFixtures } from '../../command/test-support/cli-harness.mts';
import { policy } from '../../diff/execution/test-support/analyzer-findings.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mts';
import { defineRecipes } from '../test-support/engine-views.mts';
import { fakeJvmTools, jvmRecipes, todoRecipe } from '../test-support/tool-views.mts';
import type { FakeTools, FixCliInput } from '../test-support/tool-views.mts';
import { fieldAt } from '../../../scripts/json/fields.mts';
import { parseJson, textOf } from '../../../shared/values/readers.mts';
import type { FixtureRepository } from '../../command/test-support/fixture-types.mts';
import { applyPatch, treeOf } from '../dry-run/test-support/tree.mts';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

const JAVA = 'src/main/java/demo';
const OTHER = todoRecipe('java-other-todo', 'OtherTodo', 'safe');
const FIX_RECIPES = defineRecipes([...jvmRecipes, OTHER]);
const LEGACY = [
  { file: `${JAVA}/A.java`, rule: 'UpperEll', source: 'fp:a', count: 2 },
  { file: `${JAVA}/B.java`, rule: 'UpperEll', source: 'fp:b', count: 1 },
  { file: `${JAVA}/B.java`, rule: 'OtherTodo', source: 'fp:todo', count: 1 },
];

function javaRepository() {
  return createRepository({
    'nitpicker.config.json': '{ "preset": "java" }\n',
    'build.gradle': "plugins { id 'java' }\n",
    'quality-policy.json': policy(),
    'nitpicker.legacy.json': `${JSON.stringify({ sites: LEGACY }, undefined, 2)}\n`,
    [`${JAVA}/A.java`]: 'class  A { long a = 1l; long b = 2L; long c = 3l; }\n',
    [`${JAVA}/B.java`]: 'class  B { long a = 4l; String s = "TODO"; }\n',
    [`${JAVA}/C.java`]: 'class  C {}\n',
  });
}

function run(
  repository: FixtureRepository,
  extra: readonly string[],
  tools: FakeTools = fakeJvmTools(),
) {
  const output = captureOutput();
  const outputRoot = makeOutputRoot();
  const input: FixCliInput = {
    arguments_: [...extra, '--output', outputRoot],
    currentProjectRoot: repository.root,
    environment: { NITPICKER_CACHE_DIR: makeTemporaryRoot('nitpicker-cli-cache-') },
    analyzers: [{ ...fakeAnalyzer(), reportedTools: ['checkstyle'] }],
    executeFixCommand: tools.executeFixCommand,
    fixRecipes: FIX_RECIPES,
    stdout: output.stdout,
    stderr: output.stderr,
  };
  const exitCode = runCli(input);
  return {
    exitCode,
    stdout: output.stdoutText.slice(0, output.stdoutText.indexOf('\nQuality snapshot summary')),
    stderr: output.stderrText,
    patch: path.join(outputRoot, 'fix.patch'),
  };
}

function inventory(repository: FixtureRepository): unknown {
  return fieldAt(
    parseJson(readFileSync(path.join(repository.root, 'nitpicker.legacy.json'), 'utf8')),
    'sites',
  );
}

function source(repository: FixtureRepository, name: string) {
  return readFileSync(path.join(repository.root, JAVA, name), 'utf8');
}

describe('nitpicker --fix --all --rule', () => {
  it('fixes every finding of the rule in unchanged files and lowers the legacy inventory', () => {
    const repository = javaRepository();

    const result = run(repository, ['--fix', '--all', '--rule', 'checkstyle/UpperEll']);

    expect(result.stderr).toBe('');
    expect(source(repository, 'A.java')).toBe(
      'class A { long a = 1L; long b = 2L; long c = 3L; }\n',
    );
    expect(source(repository, 'B.java')).toBe('class B { long a = 4L; String s = "TODO"; }\n');
    expect(source(repository, 'C.java')).toBe('class  C {}\n');
    expect(inventory(repository)).toEqual([LEGACY[2]]);
    expect(result.stdout).toBe(`Fixed files:
${JAVA}/A.java
${JAVA}/B.java
nitpicker.legacy.json
Fixed findings:
  ${JAVA}/A.java:1 checkstyle/UpperEll (java-upper-ell)
  ${JAVA}/A.java:1 checkstyle/UpperEll (java-upper-ell)
  ${JAVA}/B.java:1 checkstyle/UpperEll (java-upper-ell)
Fix notes:
  google-java-format rewrote ${JAVA}/A.java, ${JAVA}/B.java
  nitpicker.legacy.json: lowered the allowance for UpperEll in ${JAVA}/A.java from 2 to 0 (entry removed)
  nitpicker.legacy.json: lowered the allowance for UpperEll in ${JAVA}/B.java from 1 to 0 (entry removed)
`);
  });
  it('keeps the allowance of a site that is only partly fixed above zero', () => {
    const repository = createRepository({
      'nitpicker.config.json': '{ "preset": "java" }\n',
      'build.gradle': "plugins { id 'java' }\n",
      'quality-policy.json': policy(),
      'nitpicker.legacy.json': `${JSON.stringify({ sites: [{ ...LEGACY[0], count: 5 }] })}\n`,
      [`${JAVA}/A.java`]: 'class A { long a = 1l; }\n',
    });

    run(repository, ['--fix', '--all', '--rule', 'checkstyle/UpperEll']);

    expect(inventory(repository)).toEqual([{ ...LEGACY[0], count: 4 }]);
  });
  it('leaves the allowances alone when several sites of the file match the rule', () => {
    const sites = [LEGACY[0], { ...LEGACY[0], source: 'fp:other', count: 1 }];
    const repository = createRepository({
      'nitpicker.config.json': '{ "preset": "java" }\n',
      'build.gradle': "plugins { id 'java' }\n",
      'quality-policy.json': policy(),
      'nitpicker.legacy.json': `${JSON.stringify({ sites })}\n`,
      [`${JAVA}/A.java`]: 'class A { long a = 1l; }\n',
    });

    const result = run(repository, ['--fix', '--all', '--rule', 'checkstyle/UpperEll']);

    expect(inventory(repository)).toEqual(sites);
    expect(
      result.stdout.split('\n').filter((line) => line.includes('nitpicker.legacy.json')),
    ).toEqual([
      `  nitpicker.legacy.json: left the allowances for checkstyle/UpperEll in ${JAVA}/A.java as is, because several sites match it and a fix does not say which one it removed`,
    ]);
  });
  it('fails with a tool error when the inventory cannot be read', () => {
    const repository = createRepository({
      'nitpicker.config.json': '{ "preset": "java" }\n',
      'build.gradle': "plugins { id 'java' }\n",
      'quality-policy.json': policy(),
      'nitpicker.legacy.json': '{ not json\n',
      [`${JAVA}/A.java`]: 'class A { long a = 1l; }\n',
    });

    const result = run(repository, ['--fix', '--all', '--rule', 'checkstyle/UpperEll']);

    const errors = result.stderr
      .split('\n')
      .filter((line) => line.startsWith('nitpicker: fix tool error: '))
      .map((line) => parseJson(line.slice(line.indexOf('{'))));
    expect(errors.map((error) => fieldAt(error, 'tool'))).toEqual(['fix-baseline']);
    expect(
      textOf(fieldAt(errors, 0, 'message')).startsWith(
        '--fix could not lower the legacy inventory nitpicker.legacy.json: ',
      ),
    ).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(source(repository, 'A.java')).toBe('class A { long a = 1L; }\n');
  });
  it('previews the inventory change in the dry-run patch and writes nothing', () => {
    const repository = javaRepository();
    const before = treeOf(repository.root);

    const dry = run(repository, ['--fix', '--all', '--dry-run', '--rule', 'checkstyle/UpperEll']);
    const unchanged = treeOf(repository.root);
    applyPatch(repository.root, dry.patch);
    const patched = treeOf(repository.root);
    const real = javaRepository();
    run(real, ['--fix', '--all', '--rule', 'checkstyle/UpperEll']);

    expect(unchanged).toEqual(before);
    expect(patched).toEqual(treeOf(real.root));
    expect(dry.stdout)
      .toBe(`Fixes that --fix would apply (dry run, nothing was written to your files): 6
  ${JAVA}/A.java:1 checkstyle/UpperEll (java-upper-ell, safe)
  ${JAVA}/A.java:1 checkstyle/UpperEll (java-upper-ell, safe)
  ${JAVA}/B.java:1 checkstyle/UpperEll (java-upper-ell, safe)
  google-java-format would rewrite ${JAVA}/A.java
  google-java-format would rewrite ${JAVA}/B.java
  legacy inventory would rewrite nitpicker.legacy.json
Patch: ${dry.patch}
Fixes: ${path.join(path.dirname(dry.patch), 'fixes.json')}
Fix notes (from the dry run):
  google-java-format rewrote ${JAVA}/A.java, ${JAVA}/B.java
  nitpicker.legacy.json: lowered the allowance for UpperEll in ${JAVA}/A.java from 2 to 0 (entry removed)
  nitpicker.legacy.json: lowered the allowance for UpperEll in ${JAVA}/B.java from 1 to 0 (entry removed)
`);
  });
  it('lowers the inventory after verification keeps the fixes', () => {
    const repository = javaRepository();

    const result = run(repository, [
      '--fix',
      '--all',
      '--verify',
      'full',
      '--rule',
      'checkstyle/UpperEll',
    ]);

    expect(result.stderr).toBe('');
    expect(source(repository, 'B.java')).toBe('class B { long a = 4L; String s = "TODO"; }\n');
    expect(inventory(repository)).toEqual([LEGACY[2]]);
  });
  it('refuses a bare --fix --all and names --rule', () => {
    const result = run(javaRepository(), ['--fix', '--all']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe(
      'nitpicker failed: --fix --all rewrites the whole project, so it needs the rule to fix: use nitpicker --fix --all --rule <tool/rule>\n',
    );
  });
});
