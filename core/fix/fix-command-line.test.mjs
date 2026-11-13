import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeJvmTools } from '../../languages/java/fix/test-support/fake-jvm-tools.mjs';
import { fakePythonTools } from '../../languages/python/fix/test-support/fake-python-fix.mjs';
import { runCli as nitpickerCli } from '../cli.mts';
import { fakeAnalyzer, useCliFixtures } from '../command/test-support/cli-harness.mjs';
import { policy } from '../diff/execution/test-support/analyzer-findings.mjs';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
import { fixtureGit } from '../diff/git/test-support/git-repository.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

const FORMAT_LINE = `Format with ruff: ruff format --isolated --target-version py39 --line-length 88 --config 'format.quote-style = "double"' --config 'indent-width = 4' .`;

function transcript({ fixed, outputRoot, baseRef }) {
  return `${FORMAT_LINE}
${fixed}Base: ${baseRef} (argument)

Quality gate summary
✓ No new enforceable violations
Full diagnostics: ${outputRoot}/report.txt
`;
}

function unchangedTranscript({ fixed, repository }) {
  const sha = fixtureGit(repository.root, ['rev-parse', repository.baseRef]).trim().slice(0, 12);
  return `${FORMAT_LINE}
${fixed}No changes since ${repository.baseRef} (${sha}); nothing to check.
`;
}

const PYPROJECT = '[project]\nname = "demo"\nversion = "1"\nrequires-python = ">=3.9"\n';

function pythonRepository() {
  const repository = createRepository({
    'nitpicker.config.json': '{ "preset": "python" }\n',
    'pyproject.toml': PYPROJECT,
    'quality-policy.json': policy(),
    'app.py': 'a = 1\n',
    'unchanged.py': 'u  =  1\n',
  });
  writeFiles(repository.root, { 'app.py': 'a  =  2\n', 'new.py': 'n  =  1\n' });
  return repository;
}

function run(repository, extra, tools) {
  const output = captureOutput();
  const outputRoot = makeOutputRoot();
  const exitCode = runCli({
    arguments_: [...extra, '--base', repository.baseRef, '--output', outputRoot],
    currentProjectRoot: repository.root,
    environment: { NITPICKER_CACHE_DIR: makeTemporaryRoot('nitpicker-cli-cache-') },
    analyzers: [fakeAnalyzer()],
    executeFixCommand: tools?.executeFixCommand,
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, output, outputRoot };
}

describe('nitpicker --fix for a Python project', () => {
  it('lists the rewritten files and names the fixer before the comparison runs', () => {
    const repository = pythonRepository();
    const tools = fakePythonTools();

    const { exitCode, output, outputRoot } = run(repository, ['--fix'], tools);

    expect(exitCode, output.stdoutText + output.stderrText).toBe(0);
    expect(output.stdoutText).toBe(
      transcript({
        fixed: 'Fixed files:\napp.py\nnew.py\nFix notes:\n  ruff format rewrote app.py, new.py\n',
        outputRoot,
        baseRef: repository.baseRef,
      }),
    );
    expect(readFileSync(path.join(repository.root, 'app.py'), 'utf8')).toBe('a = 2\n');
    expect(readFileSync(path.join(repository.root, 'unchanged.py'), 'utf8')).toBe('u  =  1\n');
    expect(tools.operations()).toEqual([
      'python-probe',
      'python-probe',
      'ruff-fix',
      'ruff-fix',
      'ruff-format-fix',
      'ruff-format-fix',
      'ruff-format-fix',
    ]);
  });
  it('keeps the index and the base commit as they were', () => {
    const repository = pythonRepository();
    const indexBefore = fixtureGit(repository.root, ['ls-files', '--stage']);

    run(repository, ['--fix'], fakePythonTools());

    expect(fixtureGit(repository.root, ['ls-files', '--stage'])).toBe(indexBefore);
    expect(fixtureGit(repository.root, ['show', `${repository.baseRef}:app.py`])).toBe('a = 1\n');
  });
  it('prints no notes when there is nothing to say and rewrites nothing without --fix', () => {
    const repository = createRepository({
      'nitpicker.config.json': '{ "preset": "python" }\n',
      'pyproject.toml': PYPROJECT,
      'quality-policy.json': policy(),
    });
    const tools = fakePythonTools();

    const fixed = run(repository, ['--fix'], tools);
    const plain = run(repository, [], tools);

    expect(fixed.output.stdoutText).toBe(
      unchangedTranscript({ fixed: 'Fixed files:\n(none)\n', repository }),
    );
    expect(plain.output.stdoutText).toBe(unchangedTranscript({ fixed: '', repository }));
    expect(tools.calls).toEqual([]);
  });
  it('refuses --fix together with --all', () => {
    const repository = pythonRepository();

    const { exitCode, output } = run(repository, ['--fix', '--all'], fakePythonTools());

    expect(exitCode).toBe(2);
    expect(output.stderrText).toBe('nitpicker failed: --fix cannot be combined with --all\n');
  });
});

describe('nitpicker --fix with a recipe', () => {
  it('lists the findings a recipe fixed with the recipe that fixed them', () => {
    const repository = createRepository({
      'nitpicker.config.json': '{ "preset": "java" }\n',
      'build.gradle': "plugins { id 'java' }\n",
      'quality-policy.json': policy(),
    });
    writeFiles(repository.root, { 'src/main/java/A.java': 'class A { long a = 1l; }\n' });

    const { output } = run(repository, ['--fix'], fakeJvmTools());

    expect(output.stdoutText.slice(0, output.stdoutText.indexOf('Base: '))).toBe(
      'Fixed files:\nsrc/main/java/A.java\nFixed findings:\n  src/main/java/A.java:1 checkstyle/UpperEll (java-upper-ell)\n',
    );
    expect(readFileSync(path.join(repository.root, 'src/main/java/A.java'), 'utf8')).toBe(
      'class A { long a = 1L; }\n',
    );
  });
});
