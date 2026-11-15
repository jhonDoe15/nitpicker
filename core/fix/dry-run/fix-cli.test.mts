import { readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import { fakeAnalyzer, useCliFixtures } from '../../command/test-support/cli-harness.mts';
import { policy } from '../../diff/execution/test-support/analyzer-findings.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';
import { spawnInvocation } from '../run-fix.mts';
import { defineRecipes } from '../test-support/engine-views.mts';
import {
  fakeJvmTools,
  fakePythonTools,
  jvmRecipes,
  todoRecipe,
} from '../test-support/tool-views.mts';
import type { FixCliInput, ToolSet } from '../test-support/tool-views.mts';
import type { FixtureRepository } from '../../command/test-support/fixture-types.mts';
import { fieldAt } from '../../../scripts/json/fields.mts';
import { fieldOf, listOf, parseJson } from '../../../shared/values/readers.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mts';
import { applyPatch, treeOf } from './test-support/tree.mts';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

const JAVA = 'src/main/java/demo';
const REVIEWED = todoRecipe('java-review-todo', 'ReviewTodo', 'review');
const FIX_RECIPES = defineRecipes([...jvmRecipes, REVIEWED]);
const PYPROJECT = '[project]\nname = "demo"\nversion = "1"\nrequires-python = ">=3.9"\n';

function run(
  repository: FixtureRepository,
  extra: readonly string[],
  tools?: ToolSet,
  fixRecipes?: unknown,
) {
  const output = captureOutput();
  const outputRoot = makeOutputRoot();
  const input: FixCliInput = {
    arguments_: [...extra, '--base', repository.baseRef, '--output', outputRoot],
    currentProjectRoot: repository.root,
    environment: { NITPICKER_CACHE_DIR: makeTemporaryRoot('nitpicker-cli-cache-') },
    analyzers: [{ ...fakeAnalyzer(), reportedTools: ['checkstyle'] }],
    executeFixCommand: tools?.executeFixCommand,
    fixRecipes,
    stdout: output.stdout,
    stderr: output.stderr,
  };
  const exitCode = runCli(input);
  return {
    exitCode,
    stdout: output.stdoutText,
    stderr: output.stderrText,
    outputRoot,
    patch: path.join(outputRoot, 'fix.patch'),
    fixes: () =>
      listOf(
        fieldAt(parseJson(readFileSync(path.join(outputRoot, 'fixes.json'), 'utf8')), 'fixes'),
      ),
  };
}

function javaRepository() {
  const repository = createRepository({
    'nitpicker.config.json': '{ "preset": "java" }\n',
    'build.gradle': "plugins { id 'java' }\n",
    'quality-policy.json': policy(),
  });
  writeFiles(repository.root, {
    [`${JAVA}/A.java`]: 'class  A { long a = 1l; }\n',
    [`${JAVA}/B.java`]: 'class  B { String s = "TODO"; }\n',
    [`${JAVA}/C.java`]: 'class  C {}\n',
  });
  return repository;
}

function pythonRepository() {
  const repository = createRepository({
    'nitpicker.config.json': '{ "preset": "python" }\n',
    'pyproject.toml': PYPROJECT,
    'quality-policy.json': policy(),
  });
  writeFiles(repository.root, { 'a.py': 'import os\nx  =  1\n', 'b.py': 'y  =  2\n' });
  return repository;
}

function typescriptRepository() {
  const repository = createRepository({
    'quality-policy.json': policy(),
    'src/main/placeholder.ts': 'export const placeholder = 1;\n',
    'tests/placeholder.ts': 'export const placeholder = true;\n',
  });
  symlinkSync(
    path.join(fileURLToPath(new URL('../../../', import.meta.url)), 'node_modules'),
    path.join(repository.root, 'node_modules'),
    'dir',
  );
  writeFiles(repository.root, {
    'src/main/a.ts': 'var a=1;\nlet b=2;\nexport { a, b };\n',
    'src/main/b.ts': 'export let c=3;\n',
  });
  return repository;
}

function comparison(make: () => FixtureRepository, extra: readonly string[], tools: () => ToolSet) {
  const dry = make();
  const before = treeOf(dry.root);
  const dryRun = run(dry, [...extra, '--dry-run'], tools());
  const unchanged = treeOf(dry.root);
  applyPatch(dry.root, dryRun.patch);
  const applied = treeOf(dry.root);
  const real = make();
  const realRun = run(real, extra, tools());
  return { before, unchanged, applied, real: treeOf(real.root), dryRun, realRun };
}

describe('nitpicker --fix --dry-run', () => {
  it('leaves a Java tree as it was and writes the patch that gives the real --fix tree', () => {
    const result = comparison(javaRepository, ['--fix'], fakeJvmTools);

    expect(result.unchanged).toEqual(result.before);
    expect(result.applied).toEqual(result.real);
    expect(result.applied).not.toEqual(result.before);
    expect(result.dryRun.exitCode).toBe(result.realRun.exitCode);
    expect(
      result.dryRun.fixes().map((fix) => ({
        recipe: fieldOf(fix, 'recipe'),
        tool: fieldOf(fix, 'tool'),
        safety: fieldOf(fix, 'safety'),
        files: fieldOf(fix, 'files'),
      })),
    ).toEqual([
      { recipe: 'java-upper-ell', safety: 'safe', files: [`${JAVA}/A.java`] },
      ...['A', 'B', 'C'].map((name) => ({
        tool: 'google-java-format',
        safety: 'safe',
        files: [`${JAVA}/${name}.java`],
      })),
    ]);
  });
  it('prints one line per fix, the output files, and the same exit code as a run without --fix', () => {
    const repository = javaRepository();

    const dry = run(repository, ['--fix', '--dry-run'], fakeJvmTools());
    const plain = run(repository, [], fakeJvmTools());

    expect(dry.exitCode).toBe(plain.exitCode);
    expect(dry.stdout.slice(0, dry.stdout.indexOf('Base: ')))
      .toBe(`Fixes that --fix would apply (dry run, nothing was written to your files): 4
  ${JAVA}/A.java:1 checkstyle/UpperEll (java-upper-ell, safe)
  google-java-format would rewrite ${JAVA}/A.java
  google-java-format would rewrite ${JAVA}/B.java
  google-java-format would rewrite ${JAVA}/C.java
Patch: ${dry.outputRoot}/fix.patch
Fixes: ${dry.outputRoot}/fixes.json
Fix notes (from the dry run):
  google-java-format rewrote ${JAVA}/A.java, ${JAVA}/B.java, ${JAVA}/C.java
`);
  });
  it('leaves a Python tree as it was and writes the patch that gives the real --fix tree', () => {
    const tools = () =>
      fakePythonTools({ lintEdit: (_file, input) => input.replace('import os\n', '') });

    const result = comparison(pythonRepository, ['--fix'], tools);

    expect(result.unchanged).toEqual(result.before);
    expect(result.applied).toEqual(result.real);
    expect(result.applied).not.toEqual(result.before);
  });
  it('leaves a TypeScript tree as it was and writes the patch that gives the real --fix tree', () => {
    const result = comparison(typescriptRepository, ['--fix'], () => ({
      executeFixCommand: (invocation) =>
        fieldOf(invocation, 'operation') === 'knip-fix'
          ? { status: 0, stdout: '', stderr: '' }
          : spawnInvocation(invocation, undefined),
    }));

    expect(result.unchanged).toEqual(result.before);
    expect(result.applied).toEqual(result.real);
    expect(result.applied).not.toEqual(result.before);
  });
  it('removes a stale dry-run patch when --fix runs for real in the same output folder', () => {
    const repository = javaRepository();
    const dry = run(repository, ['--fix', '--dry-run'], fakeJvmTools());

    const output = captureOutput();
    void runCli({
      arguments_: ['--fix', '--base', repository.baseRef, '--output', dry.outputRoot],
      currentProjectRoot: repository.root,
      environment: { NITPICKER_CACHE_DIR: makeTemporaryRoot('nitpicker-cli-cache-') },
      analyzers: [fakeAnalyzer()],
      executeFixCommand: fakeJvmTools().executeFixCommand,
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(() => readFileSync(dry.patch)).toThrow('ENOENT');
  });
  it('refuses --dry-run without --fix', () => {
    const { exitCode, stderr } = run(javaRepository(), ['--dry-run'], fakeJvmTools());

    expect(exitCode).toBe(2);
    expect(stderr).toBe(
      'nitpicker failed: --dry-run only works with --fix: use nitpicker --fix --dry-run\n',
    );
  });
});

describe('nitpicker --fix --rule', () => {
  it('applies only the recipe of the named rule and formats only the files it touched', () => {
    const repository = javaRepository();

    const result = run(repository, ['--fix', '--rule', 'checkstyle/UpperEll'], fakeJvmTools());

    expect(result.exitCode).toBe(0);
    const read = (name: string) =>
      readFileSync(path.join(repository.root, `${JAVA}/${name}`), 'utf8');
    expect(read('A.java')).toBe('class A { long a = 1L; }\n');
    expect(read('B.java')).toBe('class  B { String s = "TODO"; }\n');
    expect(read('C.java')).toBe('class  C {}\n');
    expect(result.stdout.slice(0, result.stdout.indexOf('Base: '))).toBe(
      `Fixed files:\n${JAVA}/A.java\nFixed findings:\n  ${JAVA}/A.java:1 checkstyle/UpperEll (java-upper-ell)\nFix notes:\n  google-java-format rewrote ${JAVA}/A.java\n`,
    );
  });
  it('runs a review recipe only when its rule is named, and only that recipe', () => {
    const safeOnly = run(javaRepository(), ['--fix', '--dry-run'], fakeJvmTools(), FIX_RECIPES);
    const named = run(
      javaRepository(),
      ['--fix', '--dry-run', '--rule', 'checkstyle/ReviewTodo'],
      fakeJvmTools(),
      FIX_RECIPES,
    );

    expect(safeOnly.fixes().some((fix) => fieldOf(fix, 'recipe') === 'java-review-todo')).toBe(
      false,
    );
    expect(named.fixes()).toEqual([
      {
        recipe: 'java-review-todo',
        safety: 'review',
        finding: { tool: 'checkstyle', rule: 'ReviewTodo', path: `${JAVA}/B.java`, line: 1 },
        files: [`${JAVA}/B.java`],
      },
      {
        tool: 'google-java-format',
        safety: 'safe',
        files: [`${JAVA}/B.java`],
      },
    ]);
  });
  it('lets ruff fix only the named rules and formats only the files that fix touched', () => {
    const tools = fakePythonTools({ lintEdit: (_file, input) => input.replace('import os\n', '') });
    const repository = pythonRepository();

    const { exitCode } = run(repository, ['--fix', '--rule', 'ruff/F401'], tools);

    expect(exitCode).toBe(0);
    expect(readFileSync(path.join(repository.root, 'a.py'), 'utf8')).toBe('x = 1\n');
    expect(readFileSync(path.join(repository.root, 'b.py'), 'utf8')).toBe('y  =  2\n');
    const args = tools.callsOf('ruff-fix')[0]?.args ?? [];
    expect(args[args.indexOf('--fixable') + 1]).toBe('F401');
    expect(tools.callsOf('ruff-format-fix')).toHaveLength(1);
  });
  it('skips ruff when the named rule belongs to another tool', () => {
    const tools = fakePythonTools();
    const repository = pythonRepository();

    run(repository, ['--fix', '--rule', 'checkstyle/UpperEll'], tools);

    expect(tools.callsOf('ruff-fix')).toEqual([]);
    expect(tools.callsOf('ruff-format-fix')).toEqual([]);
    expect(readFileSync(path.join(repository.root, 'b.py'), 'utf8')).toBe('y  =  2\n');
  });
  it('applies only the named ESLint rule and runs Prettier on the file it changed', () => {
    const repository = typescriptRepository();

    const { exitCode, stdout } = run(repository, ['--fix', '--rule', 'eslint/no-var']);

    expect(exitCode, stdout).toBe(0);
    expect(readFileSync(path.join(repository.root, 'src/main/a.ts'), 'utf8')).toBe(
      'let a = 1;\nlet b = 2;\nexport { a, b };\n',
    );
    expect(readFileSync(path.join(repository.root, 'src/main/b.ts'), 'utf8')).toBe(
      'export let c=3;\n',
    );
  });
  it('asks for the full tool/rule name', () => {
    const { exitCode, stderr } = run(javaRepository(), ['--fix', '--rule', 'UpperEll']);

    expect(exitCode).toBe(2);
    expect(stderr).toBe(
      'nitpicker failed: --fix --rule takes the full tool/rule name of a rule ' +
        '(for example eslint/no-var), not UpperEll\n',
    );
  });
});
