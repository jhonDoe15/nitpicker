import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../../shared/test-support/temp-projects.mts';
import { fieldOf, listOf, parseJson } from '../../../../../shared/values/readers.mts';
import { ENGINE_REPORT } from '../engine-diagnostics.mts';
import { argumentFilesToCompile, errorProneOnEngine } from '../errorprone-engine.mts';
import { engineFolders, engineWriting, type Started } from '../../test-support/engine-writing.mts';
import {
  contextFiles,
  contextRoots,
  processorOutputs,
  processorReason,
  rewrittenOf,
} from './processor-sources.mts';

const projectWith = useTempProjects('nitpicker-errorprone-processors-');

type Project = {
  readonly root: string;
  readonly source: string;
  readonly written: string;
  readonly own: string;
  readonly output: string;
  readonly argumentFile: string;
  readonly reportDir: string;
  readonly javaHome: string;
};

function written(file: string, text: string): string {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

function project(): Project {
  const root = projectWith({});
  const { reportDir, javaHome } = engineFolders(root);
  const own = path.join(root, 'classes');
  const output = path.join(root, 'generated/annotations');
  const processor = path.join(root, 'processor');
  written(path.join(processor, 'META-INF/services/javax.annotation.processing.Processor'), 'p.P\n');
  written(path.join(own, 'demo/A.class'), '');
  const source = written(path.join(root, 'src/demo/A.java'), 'package demo;\nclass A {}\n');
  const generated = written(
    path.join(output, 'demo/AutoValue_A.java'),
    'package demo;\nclass B {}\n',
  );
  written(path.join(output, 'demo/notes.txt'), '');
  const argumentFile = path.join(reportDir, 'main.args');
  writeFileSync(
    argumentFile,
    [
      ...['-classpath', '/lib.jar', '-processorpath', processor, `--own-classes=${own}`],
      ...[`--processor-output=${output}`, `--processor-output=${path.join(root, 'none')}`],
      ...['--sources', source, ''],
    ].join('\n'),
  );
  return { root, source, written: generated, own, output, argumentFile, reportDir, javaHome };
}

function rewritten(file: string, message: string) {
  return { file, rule: '_Rewritten', line: 2, column: 7, message };
}

describe('source sets with annotation processors', () => {
  it('lists the sources processors wrote as context and has the engine compare classes with class files', () => {
    const {
      source,
      written: generated,
      own,
      output,
      argumentFile,
      reportDir,
      javaHome,
    } = project();
    const started: Started[] = [];
    const findings = [
      { file: source, rule: 'SystemOut', line: 2, column: 1, message: '[SystemOut] found' },
      { file: generated, rule: 'SystemOut', line: 2, column: 1, message: '[SystemOut] found' },
      { file: source, rule: '_MayReport', line: 1, column: 1, message: '' },
    ];

    errorProneOnEngine(
      { reportDir, argumentFiles: [argumentFile], javaHome },
      { NITPICKER_ENGINE: process.execPath },
      { run: engineWriting({ findings }, started) },
    );

    expect(readFileSync(`${argumentFile}.engine-sources.txt`, 'utf8')).toBe(
      `${source}\n${generated}\n`,
    );
    const [{ environment } = { environment: {} }] = started;
    expect(fieldOf(environment, 'NP_EP_AUDIT_CLASSES')).toBe(own);
    expect(fieldOf(environment, 'NP_EP_CONTEXT_ROOTS')).toBe(output);
    const report = listOf(parseJson(readFileSync(path.join(reportDir, ENGINE_REPORT), 'utf8')));
    expect(report.map((row) => fieldOf(row, 'file'))).toStrictEqual([source]);
    expect(argumentFilesToCompile([argumentFile])).toStrictEqual([]);
  });

  it('leaves the source set whole to Error Prone and names the class when a processor changed one', () => {
    const { source, argumentFile, reportDir, javaHome } = project();
    const before = readFileSync(argumentFile, 'utf8');
    const notes: string[] = [];
    const findings = [
      { file: source, rule: 'SystemOut', line: 2, column: 1, message: '[SystemOut] found' },
      rewritten(source, 'demo.A: method getName/0'),
      rewritten(source, 'demo.A$Builder: no class file'),
    ];

    errorProneOnEngine(
      { reportDir, argumentFiles: [argumentFile], javaHome },
      { NITPICKER_ENGINE: process.execPath },
      { run: engineWriting({ findings }), log: { write: (text: string) => notes.push(text) } },
    );

    expect(notes).toStrictEqual([
      'nitpicker: Error Prone compiles main whole: a class file does not match its source (demo.A: method getName/0)\n',
    ]);
    expect(readFileSync(argumentFile, 'utf8')).toBe(before);
    expect(readFileSync(path.join(reportDir, ENGINE_REPORT), 'utf8')).toBe('[]');
  });

  it('reads the processor folders that exist and the changed classes of a report', () => {
    const { root, source, written: generated, output } = project();
    const head = [`--processor-output=${output}`, `--processor-output=${path.join(root, 'none')}`];

    expect(processorOutputs(head)).toStrictEqual([output]);
    expect(contextFiles(head, [source])).toStrictEqual([generated]);
    expect(contextFiles(head, [generated])).toStrictEqual([]);
    expect(rewrittenOf({ findings: [rewritten(source, 'demo.A: field log')] })).toStrictEqual([
      'demo.A: field log',
    ]);
    expect(rewrittenOf({})).toStrictEqual([]);
    expect(contextRoots(head, [path.join(output, 'demo/Kept.java')])).toStrictEqual([]);
  });

  it('leaves the source set to Error Prone when its classes cannot be compared', () => {
    const { root, own, output } = project();
    const processor = path.join(root, 'processor');
    const head = [
      '-processorpath',
      processor,
      `--own-classes=${own}`,
      `--processor-output=${output}`,
    ];

    expect(processorReason(head)).toBeUndefined();
    expect(processorReason(['-processorpath', '', `--own-classes=${own}`])).toBeUndefined();
    expect(processorReason([...head, '--project-arg=-proc:none'])).toBe(
      'it runs annotation processors and the project compiles with -proc:none',
    );
    expect(processorReason(head.filter((line) => !line.startsWith('--own-classes=')))).toBe(
      'it runs annotation processors and the build names no class folders to compare its classes with',
    );
    expect(processorReason(head.filter((line) => !line.startsWith('--processor-output=')))).toBe(
      'it runs annotation processors and the folder they write sources to is missing',
    );
  });
});
