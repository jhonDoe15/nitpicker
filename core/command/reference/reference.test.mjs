import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { useCliFixtures } from '../test-support/cli-harness.mjs';
import { docsUrl } from '../../../shared/messages/docs-url.mjs';
import { readReferenceEntries } from '../../../shared/reference/store.mjs';

const { makeTemporaryRoot, runCli } = useCliFixtures(nitpickerCli);

const EXPLAIN_USAGE = 'Usage: nitpicker explain <tool/rule>...\n';
const RULES_USAGE =
  'Usage: nitpicker rules [--preset <typescript|javascript|java|kotlin|python>] [--tool <name>]\n';
const ENTRIES = readReferenceEntries();
const SAMPLES = [
  'crap/crap-score-limit',
  'detekt/detekt.style.MagicNumber',
  'eslint/@typescript-eslint/no-explicit-any',
  'eslint/no-undef',
  'nitpicker-config/policy-loosened',
  'pmd/UnusedLocalVariable',
  'ruff/F401',
  'structure/function-lines-limit',
];

function run(commandArguments, projectFiles = {}) {
  const root = makeTemporaryRoot('nitpicker-reference-cli-');
  for (const [name, contents] of Object.entries(projectFiles)) {
    writeFileSync(path.join(root, name), contents);
  }
  const output = captureOutput();
  const exitCode = runCli({
    arguments_: commandArguments,
    currentProjectRoot: root,
    environment: {},
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, stdout: output.stdoutText, stderr: output.stderrText };
}

const config = (fields) => ({ 'nitpicker.config.json': JSON.stringify(fields) });
const lineOf = (stdout, label) => stdout.split('\n').find((line) => line.startsWith(`${label}: `));
const listedIds = (stdout) =>
  stdout
    .split('\n')
    .slice(1)
    .filter((line) => line !== '')
    .map((line) => line.split('  ')[0]);
const samplesIn = (ids) => SAMPLES.filter((id) => ids.includes(id));

function idsReportedBy(preset, disabled = []) {
  return ENTRIES.filter(({ analyzers }) => {
    const names = analyzers[preset];
    return (
      names !== undefined && (names.length === 0 || names.some((name) => !disabled.includes(name)))
    );
  }).map(({ id }) => id);
}

describe('nitpicker explain', () => {
  it('prints the whole entry of a rule', () => {
    expect(run(['explain', 'structure/function-lines-limit'])).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: [
        'structure/function-lines-limit',
        'A function longer than the limit.',
        '',
        'Presets: TypeScript, JavaScript, Java, Kotlin and Python',
        'Analyzers: `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)',
        'Why it is on: Long functions hide several jobs in one place; agents grow them instead of splitting them.',
        'Allowed form: Split it into functions named for what each part does and put new code in a new function. A function, file or class already over its limit may be edited as long as the change does not make it worse.',
        'Threshold: more than 50 lines',
        'Exception: If this is intended, add `{"rule":"function-lines-limit","paths":["<path>"],"function":"<function>","reason":"..."}` to "exceptions" in nitpicker.config.json.',
        `Checks catalog: ${docsUrl('spec/checks.md')}`,
        `Reference: ${docsUrl('docs/rules/checks.md', 'structure-function-lines-limit')}`,
        '',
      ].join('\n'),
    });
  });

  it.each([
    [
      'eslint-lint/@typescript-eslint/no-explicit-any',
      'eslint/@typescript-eslint/no-explicit-any',
      'TypeScript and JavaScript',
      '{"rule":"@typescript-eslint/no-explicit-any","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.',
      ['typescript-eslint', 'eslint-typescript-eslint-no-explicit-any'],
    ],
    [
      'eslint/no-undef',
      'eslint/no-undef',
      'JavaScript',
      '{"rule":"no-undef","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.',
      ['typescript-eslint', 'eslint-no-undef'],
    ],
    [
      'pmd/UnusedLocalVariable',
      'pmd/UnusedLocalVariable',
      'Java and Kotlin',
      '{"rule":"pmd/UnusedLocalVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.',
      ['java-pmd', 'pmd-unusedlocalvariable'],
    ],
    [
      'detekt/detekt.style.MagicNumber',
      'detekt/detekt.style.MagicNumber',
      'Kotlin',
      '{"rule":"detekt.style.MagicNumber","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.',
      ['kotlin-detekt', 'detekt-detekt-style-magicnumber'],
    ],
    [
      'ruff/F401',
      'ruff/F401',
      'Python',
      '{"rule":"F401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.',
      ['python-ruff', 'ruff-f401'],
    ],
  ])('describes %s for its preset', (name, id, presets, exception, [page, anchor]) => {
    const { exitCode, stdout, stderr } = run(['explain', name]);

    expect({ exitCode, stderr, firstLine: stdout.split('\n')[0] }).toEqual({
      exitCode: 0,
      stderr: '',
      firstLine: id,
    });
    expect(lineOf(stdout, 'Presets')).toBe(`Presets: ${presets}`);
    expect(lineOf(stdout, 'Exception')).toBe(`Exception: If this is intended, add \`${exception}`);
    expect(lineOf(stdout, 'Reference')).toBe(
      `Reference: ${docsUrl(`docs/rules/${page}.md`, anchor)}`,
    );
  });

  it('describes a rule named without its tool and a family of rules by the name a finding prints', () => {
    expect(run(['explain', 'F401']).stdout.split('\n')[0]).toBe('ruff/F401');
    expect(run(['explain', 'mypy/attr-defined']).stdout.split('\n')[0]).toBe('mypy/<error code>');
  });

  it('describes each rule named, with a blank line between entries', () => {
    const both = run(['explain', 'ruff/F401', 'pmd/UnusedLocalVariable']);

    expect(both.exitCode).toBe(0);
    expect(both.stdout).toBe(
      `${run(['explain', 'ruff/F401']).stdout}\n${run(['explain', 'pmd/UnusedLocalVariable']).stdout}`,
    );
  });

  it('fails with the closest rules for an unknown rule', () => {
    expect(run(['explain', 'pmd/UnusedLocalVarable'])).toEqual({
      exitCode: 1,
      stdout: '',
      stderr:
        'nitpicker: unknown rule "pmd/UnusedLocalVarable". Closest: pmd/UnusedLocalVariable, pmd/UnusedFormalParameter. Run nitpicker rules to list the rules.\n',
    });
  });

  it('fails without suggestions when nothing is close, still describing the rules it knows', () => {
    expect(run(['explain', 'ruff/F401', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'])).toEqual({
      exitCode: 1,
      stdout: run(['explain', 'ruff/F401']).stdout,
      stderr:
        'nitpicker: unknown rule "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz". Run nitpicker rules to list the rules.\n',
    });
  });

  it('prints its usage for --help and fails on no rule or an unknown option', () => {
    expect(run(['explain', '--help'])).toEqual({ exitCode: 0, stdout: EXPLAIN_USAGE, stderr: '' });
    expect(run(['explain'])).toEqual({ exitCode: 2, stdout: '', stderr: EXPLAIN_USAGE });
    expect(run(['explain', '--all'])).toEqual({ exitCode: 2, stdout: '', stderr: EXPLAIN_USAGE });
  });
});

describe('nitpicker rules', () => {
  it('lists the rules of the TypeScript preset by default, one line each with the first sentence', () => {
    const { exitCode, stdout } = run(['rules']);
    const expected = idsReportedBy('typescript');

    expect(exitCode).toBe(0);
    expect(stdout.split('\n')[0]).toBe(
      `TypeScript preset: ${String(expected.length)} rules. nitpicker explain <tool/rule> describes one.`,
    );
    expect(listedIds(stdout)).toEqual(expected);
    expect(samplesIn(listedIds(stdout))).toEqual([
      'crap/crap-score-limit',
      'eslint/@typescript-eslint/no-explicit-any',
      'nitpicker-config/policy-loosened',
      'structure/function-lines-limit',
    ]);
    expect(
      stdout
        .split('\n')
        .find((line) => line.startsWith('eslint/@typescript-eslint/no-explicit-any ')),
    ).toBe('eslint/@typescript-eslint/no-explicit-any  Disallow the `any` type');
  });

  it.each([
    [
      'java',
      [
        'crap/crap-score-limit',
        'nitpicker-config/policy-loosened',
        'pmd/UnusedLocalVariable',
        'structure/function-lines-limit',
      ],
    ],
    [
      'kotlin',
      [
        'crap/crap-score-limit',
        'detekt/detekt.style.MagicNumber',
        'nitpicker-config/policy-loosened',
        'pmd/UnusedLocalVariable',
        'structure/function-lines-limit',
      ],
    ],
    [
      'python',
      [
        'crap/crap-score-limit',
        'nitpicker-config/policy-loosened',
        'ruff/F401',
        'structure/function-lines-limit',
      ],
    ],
    [
      'javascript',
      [
        'crap/crap-score-limit',
        'eslint/@typescript-eslint/no-explicit-any',
        'eslint/no-undef',
        'nitpicker-config/policy-loosened',
        'structure/function-lines-limit',
      ],
    ],
  ])('lists the rules of the %s preset with --preset', (preset, samples) => {
    const ids = listedIds(run(['rules', '--preset', preset]).stdout);

    expect(ids).toEqual(idsReportedBy(preset));
    expect(samplesIn(ids)).toEqual(samples);
  });

  it('narrows the list to one tool', () => {
    const ids = listedIds(run(['rules', '--preset', 'java', '--tool', 'checkstyle']).stdout);

    expect(ids).toEqual(idsReportedBy('java').filter((id) => id.startsWith('checkstyle/')));
    expect(ids.length).toBeGreaterThan(10);
  });

  it('uses the preset of the project config', () => {
    const { stdout } = run(['rules'], config({ preset: 'python' }));

    expect(listedIds(stdout)).toEqual(idsReportedBy('python'));
  });

  it('leaves out the rules of the analyzers the project disables', () => {
    const disable = ['crap', 'eslint-lint'];
    const ids = listedIds(run(['rules'], config({ preset: 'typescript', disable })).stdout);

    expect(ids).toEqual(idsReportedBy('typescript', disable));
    expect(samplesIn(ids)).toEqual([
      'nitpicker-config/policy-loosened',
      'structure/function-lines-limit',
    ]);
  });

  it('does not apply the config disable list to another preset', () => {
    const ids = listedIds(
      run(['rules', '--preset', 'python'], config({ preset: 'typescript', disable: ['python'] }))
        .stdout,
    );

    expect(ids).toEqual(idsReportedBy('python'));
  });

  it('fails on an unknown preset and on a bad option, and prints usage for --help', () => {
    expect(run(['rules', '--preset', 'cobol'])).toEqual({
      exitCode: 2,
      stdout: '',
      stderr:
        'nitpicker failed: nitpicker.config.json: unknown preset "cobol". Presets: typescript, javascript, java, kotlin, python\n',
    });
    expect(run(['rules', '--preset'])).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: `nitpicker: --preset requires a value.\n${RULES_USAGE}`,
    });
    expect(run(['rules', '--bogus'])).toEqual({ exitCode: 2, stdout: '', stderr: RULES_USAGE });
    expect(run(['rules', '--help'])).toEqual({ exitCode: 0, stdout: RULES_USAGE, stderr: '' });
  });
});
