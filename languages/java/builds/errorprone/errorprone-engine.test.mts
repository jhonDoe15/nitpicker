import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { fieldOf, listOf, parseJson } from '../../../../shared/values/readers.mts';
import { ENGINE_REPORT, positionIn, withEngineDiagnostics } from './engine-diagnostics.mts';
import {
  errorPronePlanOf,
  errorProneOnEngine,
  javaHomeOf,
  type ErrorProneEnginePlan,
} from './errorprone-engine.mts';

import { engineWriting, type Started } from '../test-support/engine-writing.mts';

const projectWith = useTempProjects('nitpicker-errorprone-engine-');

type Setup = {
  readonly plan: ErrorProneEnginePlan;
  readonly environment: Record<string, string>;
  readonly source: string;
  readonly generated: string;
  readonly argumentFile: string;
};

function setup(...lines: readonly string[]): Setup {
  const root = projectWith({});
  const reportDir = path.join(root, 'report');
  const javaHome = path.join(root, 'jdk');
  const own = path.join(root, 'classes');
  const source = path.join(root, 'src/demo/A.java');
  const generated = path.join(root, 'gen/demo/B.java');
  for (const directory of [reportDir, path.join(javaHome, 'jmods'), path.join(own, 'demo')]) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(path.join(own, 'demo/A.class'), '');
  for (const file of [source, generated]) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'package demo;\nclass A {\n\tvoid run() { System.out.println(); }\n}\n');
  }
  const argumentFile = path.join(reportDir, 'main.args');
  writeFileSync(
    argumentFile,
    [
      ...['-classpath', '/lib.jar', '-processorpath', '', `--own-classes=${own}`, '--release=17'],
      ...['--skip-generated', `--generated-root=${path.join(root, 'gen')}`, ...lines],
      ...['--sources', source, generated, ''],
    ].join('\n'),
  );
  return {
    plan: { reportDir, argumentFiles: [argumentFile], javaHome },
    environment: { NITPICKER_ENGINE: process.execPath },
    source,
    generated,
    argumentFile,
  };
}

function rowIn(file: string, rule: string) {
  return { file, rule, line: 3, column: 24, message: `[${rule}] found` };
}

describe('errorProneOnEngine', () => {
  it('runs its checks on the engine, reports them like Error Prone and switches them off there', () => {
    const { plan, environment, source, generated, argumentFile } = setup();
    const started: Started[] = [];
    const findings = [
      rowIn(source, 'SystemOut'),
      rowIn(generated, 'NullAway'),
      rowIn(source, 'Other'),
    ];

    errorProneOnEngine(plan, environment, { run: engineWriting({ findings }, started) });

    expect(parseJson(readFileSync(path.join(plan.reportDir, ENGINE_REPORT), 'utf8'))).toStrictEqual(
      [
        {
          file: source,
          line: 3,
          endLine: 3,
          column: 24,
          position: 40,
          kind: 'WARNING',
          message: '[SystemOut] found',
          classAnnotations: [],
        },
      ],
    );
    const [{ argumentList, environment: passed } = { argumentList: [], environment: {} }] = started;
    expect(argumentList.slice(0, 4)).toStrictEqual([
      '--files',
      `${argumentFile}.engine-sources.txt`,
      '--rules',
      '_ErrorProne',
    ]);
    expect(argumentList).toContain('--release');
    expect(readFileSync(`${argumentFile}.engine-classpath.txt`, 'utf8').split('\n')[0]).toBe(
      '/lib.jar',
    );
    expect(passed).toMatchObject({
      NP_NULLAWAY_PACKAGES: 'demo',
      NITPICKER_JDK: plan.javaHome,
    });
    const text = readFileSync(argumentFile, 'utf8');
    expect(text).toContain('--errorprone-flag=-Xep:NullAway:OFF\n--sources\n');
    expect(text).toContain('--errorprone-flag=-Xep:SystemOut:OFF\n');
  });

  it('leaves NullAway to Error Prone when the engine says a library holds marks it did not read', () => {
    const { plan, environment, source, argumentFile } = setup();
    const findings = [rowIn(source, 'SystemOut'), rowIn(source, 'NullAway')];

    errorProneOnEngine(plan, environment, {
      run: engineWriting({ findings, nullAwayUnsure: true }),
    });

    const report = readFileSync(path.join(plan.reportDir, ENGINE_REPORT), 'utf8');
    expect(listOf(parseJson(report)).map((row) => fieldOf(row, 'message'))).toStrictEqual([
      '[SystemOut] found',
    ]);
    const text = readFileSync(argumentFile, 'utf8');
    expect(text).toContain('-Xep:SystemOut:OFF');
    expect(text).not.toContain('-Xep:NullAway:OFF');
  });

  it.each([
    ['the engine fails', () => ({ status: 1, stdout: '', stderr: 'no types' })],
    [
      'the engine cannot read a file',
      engineWriting({ findings: [], syntaxErrorFiles: ['/A.java'] }),
    ],
  ])('leaves every check to Error Prone when %s', (_, run) => {
    const { plan, environment, argumentFile } = setup();
    const before = readFileSync(argumentFile, 'utf8');
    const notes: string[] = [];
    const log = { write: (text: string) => notes.push(text) };

    errorProneOnEngine(plan, environment, { run, log });

    expect(notes.join('')).toContain('Error Prone runs them');

    expect(readFileSync(argumentFile, 'utf8')).toBe(before);
    expect(readFileSync(path.join(plan.reportDir, ENGINE_REPORT), 'utf8')).toBe('[]');
  });

  it('does nothing without the engine, without the JDK modules or when the project passes options', () => {
    const { plan, environment, argumentFile } = setup('--errorprone-flag=-XepDisableAllChecks');
    const before = readFileSync(argumentFile, 'utf8');
    const started: Started[] = [];
    writeFileSync(path.join(plan.reportDir, ENGINE_REPORT), '[{}]');

    errorProneOnEngine(plan, { NITPICKER_ENGINE: 'off' }, { run: engineWriting({}, started) });

    expect(existsSync(path.join(plan.reportDir, ENGINE_REPORT))).toBe(false);
    errorProneOnEngine({ ...plan, javaHome: plan.reportDir }, environment, {
      run: engineWriting({}, started),
    });
    errorProneOnEngine(plan, environment, { run: engineWriting({}, started) });
    expect(started).toStrictEqual([]);
    expect(readFileSync(argumentFile, 'utf8')).toBe(before);
  });

  it('reads the plan the build writes and finds the JDK of a java command', () => {
    const plan = { reportDir: '/r', argumentFiles: ['/r/main.args'], javaHome: '/jdk' };

    expect(errorPronePlanOf({ ...plan, more: 1 })).toStrictEqual(plan);
    expect(javaHomeOf('java')).toBe('');
    expect(existsSync(path.join(javaHomeOf(process.execPath), 'bin'))).toBe(true);
  });
});

describe('engine diagnostics', () => {
  it('counts a tab to the next multiple of eight, as javac does for the column', () => {
    expect(positionIn('ab\n\t\tx = 1;\n', 2, 17)).toBe(5);
    expect(positionIn('ab\n\t\tx = 1;\n', 1, 2)).toBe(1);
    expect(positionIn('ab\n a\tb', 2, 9)).toBe(6);
  });

  it('adds the engine findings to the Error Prone report unless Error Prone was skipped', () => {
    const { plan } = setup();
    const file = path.join(plan.reportDir, ENGINE_REPORT);

    expect(withEngineDiagnostics([{ line: 1 }], plan.reportDir)).toStrictEqual([{ line: 1 }]);
    writeFileSync(file, '[{"line":2}]');
    expect(withEngineDiagnostics([{ line: 1 }], plan.reportDir)).toStrictEqual([
      { line: 1 },
      { line: 2 },
    ]);
    expect(withEngineDiagnostics({ broken: true }, plan.reportDir)).toStrictEqual({ broken: true });
    writeFileSync(path.join(plan.reportDir, 'errorprone-skipped.txt'), 'no JDK\n');
    expect(withEngineDiagnostics([{ line: 1 }], plan.reportDir)).toStrictEqual([{ line: 1 }]);
  });
});
