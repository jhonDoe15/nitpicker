import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import type { EngineStart } from '../../../../shared/engine/engine-run.mts';
import { ingestCheckstyle } from '../../ingest/formatting/checkstyle.mts';
import {
  nitpickerCheckstyleConfig,
  reportingCheckstyleConfig,
  withGuardChecks,
} from './checkstyle-config.mts';
import {
  checkstyleEnginePlanOf,
  checkstyleOnEngine,
  engineCoversConfig,
} from './checkstyle-engine.mts';

const projectWith = useTempProjects('nitpicker-checkstyle-engine-');

const GOOGLE_CHECKS = [
  '<module name="Checker">',
  '  <module name="TreeWalker">',
  '    <module name="GoogleNonConstantFieldName"/>',
  '    <module name="MethodName"><property name="format" value="^[a-z]$"/></module>',
  '    <module name="TodoComment"><property name="id" value="TodoFormat"/></module>',
  '  </module>',
  '</module>',
].join('\n');
const PACKAGE = 'com.puppycrawl.tools.checkstyle.checks';
const METHOD_NAME = `${PACKAGE}.naming.MethodNameCheck`;
const MAGIC_NUMBER = `${PACKAGE}.coding.MagicNumberCheck`;

function covered(guards: readonly string[]): string {
  return withGuardChecks(
    reportingCheckstyleConfig(nitpickerCheckstyleConfig(GOOGLE_CHECKS), 'formatted'),
    guards,
  );
}

function setup(guards: readonly string[], config = covered(guards)) {
  const root = projectWith({});
  const binary = path.join(root, 'nitpicker-engine');
  writeFileSync(binary, '');
  const write = (name: string, text: string) => {
    const file = path.join(root, name);
    writeFileSync(file, text);
    return file;
  };
  const sources = ['A.java', 'B.java', 'C.java'].map((name) => write(name, 'class A {}\n'));
  return {
    plan: checkstyleEnginePlanOf({
      config: write('checkstyle.xml', config),
      bundled: write('google_checks.xml', GOOGLE_CHECKS),
      guards,
      files: write('files.txt', sources.join('\n')),
      engineReport: path.join(root, 'checkstyle-engine.xml'),
      left: path.join(root, 'left.txt'),
      version: '13.5.0',
    }),
    environment: { NITPICKER_ENGINE: binary },
    sources,
  };
}

function engineWriting(findings: readonly object[], syntaxErrorFiles: readonly string[] = []) {
  const calls: (readonly string[])[] = [];
  const lists: string[] = [];
  const run: EngineStart = (argumentList) => {
    calls.push(argumentList);
    const files = readFileSync(String(argumentList[3]), 'utf8').split('\n').filter(Boolean);
    lists.push(files.join('\n'));
    const report = { files: files.length, findings, syntaxErrorFiles };
    writeFileSync(String(argumentList[5]), JSON.stringify(report));
    return { status: 0, stdout: '', stderr: '' };
  };
  return { calls, lists, run };
}

describe('engineCoversConfig', () => {
  it('covers the configuration a Java run writes for main and test sources', () => {
    const all = ['checkstyle-all.xml'];
    const main = [...all, 'checkstyle-main.xml'];
    expect(engineCoversConfig(covered(all), GOOGLE_CHECKS, all)).toBe(true);
    expect(engineCoversConfig(covered(main), GOOGLE_CHECKS, main)).toBe(true);
  });

  it('does not cover a configuration with any other module or property', () => {
    const guards = ['checkstyle-all.xml'];
    const changed = covered(guards).replace('<module name="TreeWalker">', '$&<module name="X"/>');
    expect(engineCoversConfig(changed, GOOGLE_CHECKS, guards)).toBe(false);
    expect(engineCoversConfig(covered(guards), GOOGLE_CHECKS, ['checkstyle-main.xml'])).toBe(false);
  });
});

describe('checkstyleOnEngine', () => {
  it('writes the findings as a Checkstyle report and leaves unreadable files to Checkstyle', () => {
    const { plan, environment, sources } = setup(['checkstyle-all.xml']);
    const [a = '', b = '', c = ''] = sources;
    const { calls, run } = engineWriting(
      [
        { file: a, rule: METHOD_NAME, line: 4, column: 3, message: 'm' },
        { file: a, rule: MAGIC_NUMBER, line: 2, column: 9, message: 'magic' },
        { file: b, rule: 'CheckstyleUnparsed', line: 1, column: 0, message: '' },
      ],
      [c],
    );
    expect(checkstyleOnEngine(plan, environment, { run })).toEqual([b, c]);
    expect(calls).toEqual([
      [
        '--rules',
        'Checkstyle',
        '--files',
        `${plan.engineReport}.files.txt`,
        '--out',
        `${plan.engineReport}.json`,
      ],
    ]);
    expect(readFileSync(plan.left, 'utf8')).toBe([b, c].join('\n'));
    const xml = readFileSync(plan.engineReport, 'utf8');
    expect(ingestCheckstyle(xml, { root: path.dirname(a) }).findings).toEqual([
      expect.objectContaining({
        rule: METHOD_NAME,
        path: 'A.java',
        location: { line: 4, column: 3 },
      }),
    ]);
    expect(existsSync(`${plan.engineReport}.json`)).toBe(false);
  });

  it('keeps the main-only checks for main sources', () => {
    const { plan, environment, sources } = setup(['checkstyle-all.xml', 'checkstyle-main.xml']);
    const { run } = engineWriting([
      { file: sources[0], rule: MAGIC_NUMBER, line: 2, column: 9, message: 'magic' },
    ]);
    expect(checkstyleOnEngine(plan, environment, { run })).toEqual([]);
    const xml = readFileSync(plan.engineReport, 'utf8');
    expect(ingestCheckstyle(xml, { root: path.dirname(plan.files) }).findings).toHaveLength(1);
  });

  it('leaves module descriptors and files the engine reads differently to Checkstyle', () => {
    const { plan, environment, sources } = setup(['checkstyle-all.xml']);
    const [a = '', b = '', c = ''] = sources;
    const descriptor = path.join(path.dirname(a), 'module-info.java');
    writeFileSync(descriptor, 'module m {}\n');
    writeFileSync(b, Buffer.from([0x63, 0xe9, 0x0a]));
    writeFileSync(c, '\uFEFFclass C {}\n');
    writeFileSync(plan.files, [a, b, c, descriptor].join('\n'));
    const { lists, run } = engineWriting([]);
    expect(checkstyleOnEngine(plan, environment, { run })).toEqual([b, c, descriptor]);
    expect(lists).toEqual([a]);
  });

  it('leaves everything to Checkstyle when the engine skipped a file', () => {
    const { plan, environment } = setup(['checkstyle-all.xml']);
    const run: EngineStart = (argumentList) => {
      writeFileSync(String(argumentList[5]), JSON.stringify({ files: 2, findings: [] }));
      return { status: 0, stdout: '', stderr: '' };
    };
    expect(checkstyleOnEngine(plan, environment, { run })).toBeUndefined();
    expect(existsSync(plan.engineReport)).toBe(false);
  });

  it('leaves a configuration it does not cover to Checkstyle without calling the engine', () => {
    const { plan, environment } = setup(['checkstyle-all.xml'], '<module name="Checker"/>');
    const { calls, run } = engineWriting([]);
    expect(checkstyleOnEngine(plan, environment, { run })).toBeUndefined();
    expect(calls).toEqual([]);
    expect(existsSync(plan.left)).toBe(false);
  });

  it('leaves everything to Checkstyle when the engine is off or fails', () => {
    const { plan, environment } = setup(['checkstyle-all.xml']);
    expect(checkstyleOnEngine(plan, { NITPICKER_ENGINE: 'off' })).toBeUndefined();
    const written: string[] = [];
    const failing: EngineStart = () => ({ status: 2, stdout: '', stderr: 'broken\n' });
    const log = { write: (text: string) => written.push(text) };
    expect(checkstyleOnEngine(plan, environment, { run: failing, log })).toBeUndefined();
    expect(existsSync(plan.engineReport)).toBe(false);
    expect(written).toEqual([
      'nitpicker: the engine did not run the Checkstyle checks, Checkstyle does: broken\n',
    ]);
  });
});
