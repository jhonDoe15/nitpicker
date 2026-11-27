import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { spawnResult } from '../../adapters/test-support/spawn-result.mts';
import type { JavaSpawn } from '../../adapters/typed/java-values.mts';
import { argumentFileTokens } from '../../builds/lint/javac-options.mts';
import { checkstyleXml, fileElements } from '../../builds/checkstyle/checkstyle-xml.mts';
import { runCheckstyle } from './maven-checkstyle.mts';

const projectWith = useTempProjects('nitpicker-maven-checkstyle-');
const VERSION = '13.5.0';
const GOOGLE_CHECKS = [
  '<module name="Checker">',
  '  <module name="TreeWalker">',
  '    <module name="GoogleNonConstantFieldName"/>',
  '    <module name="MethodName"><property name="format" value="^[a-z]$"/></module>',
  '    <module name="TodoComment"><property name="id" value="TodoFormat"/></module>',
  '  </module>',
  '</module>',
].join('\n');
const CHECKSTYLE_REPORT = [
  '<?xml version="1.0"?>',
  `<checkstyle version="${VERSION}">`,
  '<file name="B.java">',
  '</file>',
  '</checkstyle>',
  '',
].join('\n');

type Ran = { readonly checked: string[][] };

function engineAt(root: string, unparsed: string): string {
  const engine = path.join(root, 'engine.cjs');
  writeFileSync(
    engine,
    [
      `#!${process.execPath}`,
      "const fs = require('node:fs');",
      'const at = (flag) => process.argv[process.argv.indexOf(flag) + 1];',
      "const files = fs.readFileSync(at('--files'), 'utf8').split('\\n').filter(Boolean);",
      `const named = files.filter((file) => file.endsWith(${JSON.stringify(unparsed)}));`,
      "fs.writeFileSync(at('--out'), JSON.stringify({ files: files.length, findings: [], syntaxErrorFiles: named }));",
    ].join('\n'),
  );
  chmodSync(engine, 0o755);
  return engine;
}

function javaSpawn(ran: Ran): JavaSpawn {
  return (command, args, options) => {
    if (path.basename(command) === 'jar') {
      if (args[1] === '') {
        return spawnResult({ status: 1, stderr: 'no jar' });
      }
      writeFileSync(path.join(String(options.cwd), 'google_checks.xml'), GOOGLE_CHECKS);
      return spawnResult({ status: 0 });
    }
    if (args.includes('-version')) {
      return spawnResult({ status: 0, stderr: 'openjdk version "21.0.2" 2024-01-16' });
    }
    const tokens = argumentFileTokens(readFileSync(String(args[0]).slice(1), 'utf8'));
    writeFileSync(String(tokens[tokens.indexOf('-o') + 1]), CHECKSTYLE_REPORT);
    ran.checked.push(tokens.slice(tokens.indexOf('-o') + 2));
    return spawnResult({ status: 0 });
  };
}

function run(unparsed: string, tools: Readonly<Record<string, readonly string[]>>, engine = true) {
  const basedir = projectWith({
    'src/main/java/A.java': 'class A {}\n',
    'src/main/java/B.java': 'class B {}\n',
  });
  const reportDir = path.join(basedir, 'report');
  const ran: Ran = { checked: [] };
  runCheckstyle({
    module: {
      basedir,
      outputDirectory: path.join(basedir, 'target/classes'),
      testOutputDirectory: path.join(basedir, 'target/test-classes'),
      sourceRoots: [path.join(basedir, 'src/main/java')],
      testSourceRoots: [],
      compiler: {},
    },
    reportDir,
    tools,
    configs: {},
    pinned: { checkstyle: VERSION },
    style: {},
    spawn: javaSpawn(ran),
    environment: { NITPICKER_ENGINE: engine ? engineAt(basedir, unparsed) : 'off', PATH: '' },
  });
  const sources = ['A.java', 'B.java'].map((name) => path.join(basedir, 'src/main/java', name));
  return { ran, report: path.join(reportDir, 'checkstyle.xml'), sources };
}

const TOOLS = { checkstyle: [`/m2/checkstyle-${VERSION}.jar`] };

describe('runCheckstyle', () => {
  it('keeps the engine report and runs no Checkstyle when the engine reads every file', () => {
    const { ran, report, sources } = run('none', TOOLS);

    expect(ran.checked).toEqual([]);
    expect(readFileSync(report, 'utf8')).toBe(checkstyleXml(VERSION, fileElements(sources, [])));
  });

  it('runs Checkstyle on the files the engine leaves and adds the engine files to its report', () => {
    const { ran, report, sources } = run('B.java', TOOLS);

    expect(ran.checked.map((files) => files.map((file) => path.basename(file)))).toEqual([
      ['B.java'],
    ]);
    const merged = readFileSync(report, 'utf8');
    const engineFile = fileElements(sources.slice(0, 1), []);
    expect(merged).toBe(CHECKSTYLE_REPORT.replace('</checkstyle>', `${engineFile}\n</checkstyle>`));
  });

  it('runs Checkstyle on every file when the engine is off', () => {
    const { ran } = run('none', TOOLS, false);

    expect(ran.checked.map((files) => files.map((file) => path.basename(file)).toSorted())).toEqual(
      [['A.java', 'B.java']],
    );
  });

  it('fails without a resolved Checkstyle jar to read the Google checks from', () => {
    expect(() => run('none', {})).toThrow('could not read google_checks.xml from undefined');
  });
});
