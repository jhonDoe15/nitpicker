import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../cli.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';
import { useCliFixtures } from './test-support/cli-harness.mjs';

const { makeTemporaryRoot, runCli } = useCliFixtures(nitpickerCli);

function run(arguments_, projectFiles = {}) {
  const root = makeTemporaryRoot('nitpicker-reference-cli-');
  for (const [name, contents] of Object.entries(projectFiles)) {
    writeFileSync(path.join(root, name), contents);
  }
  const output = captureOutput();
  const exitCode = runCli({
    arguments_,
    currentProjectRoot: root,
    environment: {},
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, stdout: output.stdoutText, stderr: output.stderrText };
}

const config = (fields) => ({ 'nitpicker.config.json': JSON.stringify(fields) });
const listedIds = (stdout) =>
  stdout
    .split('\n')
    .slice(1)
    .filter((line) => line !== '')
    .map((line) => line.split('  ')[0]);

describe('nitpicker explain', () => {
  it.each([
    [
      'a TypeScript rule',
      'eslint-lint/@typescript-eslint/no-explicit-any',
      'eslint/@typescript-eslint/no-explicit-any',
      'TypeScript',
    ],
    ['a JavaScript rule', 'eslint/no-undef', 'eslint/no-undef', 'JavaScript'],
    ['a Java rule', 'pmd/UnusedLocalVariable', 'pmd/UnusedLocalVariable', 'Java'],
    [
      'a Kotlin rule',
      'detekt/detekt.style.MagicNumber',
      'detekt/detekt.style.MagicNumber',
      'Kotlin',
    ],
    ['a Python rule', 'ruff/F401', 'ruff/F401', 'Python'],
    ['a shared check', 'structure/function-lines-limit', 'structure/function-lines-limit', 'Java'],
  ])('describes %s', (_description, name, id, preset) => {
    const { exitCode, stdout, stderr } = run(['explain', name]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout.split('\n')[0]).toBe(id);
    expect(stdout).toMatch(new RegExp(`^Presets: .*${preset}`, 'mu'));
    expect(stdout).toMatch(/^Exception: If this is intended, add `\{"rule":/mu);
    expect(stdout).toMatch(
      /^Reference: https:\/\/github\.com\/.*\/docs\/rules\/[a-z-]+\.md#[a-z0-9-]+$/mu,
    );
  });

  it('prints the allowed form and the exception shape of a rule', () => {
    const { stdout } = run(['explain', 'structure/function-lines-limit']);

    expect(stdout).toContain('Allowed form: ');
    expect(stdout).toContain('Threshold: more than 50 lines');
    expect(stdout).toContain(
      '"rule":"function-lines-limit","paths":["<path>"],"function":"<function>","reason":"..."',
    );
  });

  it('describes a rule named without its tool and a family of rules by the name a finding prints', () => {
    expect(run(['explain', 'F401']).stdout.split('\n')[0]).toBe('ruff/F401');
    expect(run(['explain', 'mypy/attr-defined']).stdout.split('\n')[0]).toBe('mypy/<error code>');
  });

  it('describes each rule named, one after another', () => {
    const { exitCode, stdout } = run(['explain', 'ruff/F401', 'pmd/UnusedLocalVariable']);

    expect(exitCode).toBe(0);
    expect(stdout.match(/^(?:ruff|pmd)\/\S+$/gmu)).toEqual([
      'ruff/F401',
      'pmd/UnusedLocalVariable',
    ]);
  });

  it('fails with the closest rules for an unknown rule', () => {
    const { exitCode, stdout, stderr } = run(['explain', 'pmd/UnusedLocalVarable']);

    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toBe(
      'nitpicker: unknown rule "pmd/UnusedLocalVarable". Closest: pmd/UnusedLocalVariable, pmd/UnusedFormalParameter. Run nitpicker rules to list the rules.\n',
    );
  });

  it('fails without suggestions when nothing is close, still describing the rules it knows', () => {
    const { exitCode, stdout, stderr } = run([
      'explain',
      'ruff/F401',
      'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    ]);

    expect(exitCode).toBe(1);
    expect(stdout.split('\n')[0]).toBe('ruff/F401');
    expect(stderr).toBe(
      'nitpicker: unknown rule "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz". Run nitpicker rules to list the rules.\n',
    );
  });

  it('prints its usage for --help and fails on no rule or an unknown option', () => {
    expect(run(['explain', '--help'])).toMatchObject({
      exitCode: 0,
      stdout: 'Usage: nitpicker explain <tool/rule>...\n',
    });
    expect(run(['explain'])).toMatchObject({
      exitCode: 2,
      stderr: 'Usage: nitpicker explain <tool/rule>...\n',
    });
    expect(run(['explain', '--all']).exitCode).toBe(2);
  });
});

describe('nitpicker rules', () => {
  it('lists the rules of the TypeScript preset by default, one line each with the first sentence', () => {
    const { exitCode, stdout } = run(['rules']);
    const ids = listedIds(stdout);

    expect(exitCode).toBe(0);
    expect(stdout.split('\n')[0]).toMatch(/^TypeScript preset: \d+ rules\. /u);
    expect(ids).toContain('eslint/@typescript-eslint/no-explicit-any');
    expect(ids).toContain('structure/function-lines-limit');
    expect(ids).not.toContain('pmd/UnusedLocalVariable');
    expect(ids).not.toContain('ruff/F401');
    expect(stdout).toContain('eslint/@typescript-eslint/no-explicit-any  Disallow the `any` type');
  });

  it('lists the rules of the preset named with --preset', () => {
    const java = listedIds(run(['rules', '--preset', 'java']).stdout);
    const python = listedIds(run(['rules', '--preset', 'python']).stdout);

    expect(java).toContain('pmd/UnusedLocalVariable');
    expect(java).not.toContain('detekt/detekt.style.MagicNumber');
    expect(java).not.toContain('ruff/F401');
    expect(python).toContain('ruff/F401');
    expect(python).not.toContain('pmd/UnusedLocalVariable');
    expect(listedIds(run(['rules', '--preset', 'kotlin']).stdout)).toContain(
      'detekt/detekt.style.MagicNumber',
    );
  });

  it('narrows the list to one tool', () => {
    const { stdout } = run(['rules', '--preset', 'java', '--tool', 'checkstyle']);

    expect(listedIds(stdout).every((id) => id.startsWith('checkstyle/'))).toBe(true);
    expect(listedIds(stdout).length).toBeGreaterThan(10);
  });

  it('uses the preset of the project config', () => {
    const { stdout } = run(['rules'], config({ preset: 'python' }));

    expect(stdout.split('\n')[0]).toMatch(/^Python preset: /u);
    expect(listedIds(stdout)).toContain('ruff/F401');
  });

  it('leaves out the rules of the analyzers the project disables', () => {
    const all = listedIds(run(['rules'], config({ preset: 'typescript' })).stdout);
    const disabled = listedIds(
      run(['rules'], config({ preset: 'typescript', disable: ['crap', 'eslint-lint'] })).stdout,
    );

    expect(all).toContain('crap/crap-score-limit');
    expect(all).toContain('eslint/@typescript-eslint/no-explicit-any');
    expect(disabled).not.toContain('crap/crap-score-limit');
    expect(disabled).not.toContain('eslint/@typescript-eslint/no-explicit-any');
    expect(disabled).toContain('structure/function-lines-limit');
    expect(disabled.length).toBeLessThan(all.length);
  });

  it('does not apply the config disable list to another preset', () => {
    const python = listedIds(
      run(['rules', '--preset', 'python'], config({ preset: 'typescript', disable: ['structure'] }))
        .stdout,
    );

    expect(python).toContain('structure/function-lines-limit');
  });

  it('fails on an unknown preset and on an option without a value, and prints usage for --help', () => {
    expect(run(['rules', '--preset', 'cobol']).exitCode).toBe(2);
    expect(run(['rules', '--preset']).stderr).toContain('--preset requires a value');
    expect(run(['rules', '--bogus']).stderr).toContain('Usage: nitpicker rules');
    expect(run(['rules', '--help'])).toMatchObject({ exitCode: 0 });
  });
});
