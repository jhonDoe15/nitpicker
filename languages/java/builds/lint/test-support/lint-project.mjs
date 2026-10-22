import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { javaCommand } from '../../../maven/maven-command.mjs';
import { lintFingerprint } from '../lint-baseline.mjs';
import { runJavacLint } from '../javac-lint-runner.mjs';

export const JAVAC = javaCommand('javac');
const NO_SETTINGS = { release: '17', source: undefined, target: undefined, args: [] };

export function createTemporaries() {
  const roots = [];
  return {
    directory() {
      const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-javac-lint-'));
      roots.push(root);
      return root;
    },
    remove() {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

function inside(root, name) {
  const target = path.resolve(root, name);
  if (!target.startsWith(root + path.sep)) {
    throw new Error(`${name} is outside ${root}`);
  }
  return target;
}

export function writeFiles(root, files) {
  for (const [name, text] of Object.entries(files)) {
    const target = inside(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

function javaFilesUnder(directory) {
  return existsSync(directory)
    ? readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
        .map((entry) => path.join(entry.parentPath, entry.name))
    : [];
}

export function javaPlan(root, { basedir = root, compiler = {}, classpath = [], ...rest } = {}) {
  return {
    root,
    basedir,
    reportRoot: basedir,
    sources: javaFilesUnder(path.join(basedir, 'src/main/java')),
    generatedSources: [],
    classDirectory: path.join(basedir, 'target/classes'),
    classpath,
    processorPath: classpath,
    javac: JAVAC,
    compiler: { ...NO_SETTINGS, ...compiler },
    workDirectory: path.join(basedir, 'target/nitpicker-lint/work'),
    cacheDirectory: path.join(basedir, 'target/nitpicker-lint'),
    ...rest,
  };
}

export function compileClasses(plan) {
  execFileSync(JAVAC, ['-d', plan.classDirectory, ...plan.sources], { timeout: 10_000 });
}

export function baseCache(plan, lines) {
  writeFiles(plan.cacheDirectory, {
    'javac-lint.txt': [...lines, ''].join('\n'),
    'javac-lint-fingerprint.txt': lintFingerprint(plan),
  });
}

export function warning(file, line) {
  return `${file}:${String(line)}: warning: [rawtypes] found raw type: List`;
}

export function rawTypeWarning(file, { line, source, caret }) {
  return [
    warning(file, line),
    source,
    caret,
    '  missing type arguments for generic class List<E>',
    '  where E is a type-variable:',
    '    E extends Object declared in interface List',
  ];
}

export function namesWarning(file, line = 3) {
  return rawTypeWarning(file, { line, source: '  java.util.List names;', caret: '           ^' });
}

function reportLines(file) {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n') : undefined;
}

export function lint(plan, baselineRoot) {
  const reportDir = path.join(plan.basedir, 'target/nitpicker');
  mkdirSync(reportDir, { recursive: true });
  runJavacLint(plan, { reportDir, baselineRoot });
  return {
    report: reportLines(path.join(reportDir, 'javac-lint.txt')),
    failure: reportLines(path.join(reportDir, 'javac-lint-failed.txt')),
  };
}

export function warningHeaders(report) {
  return report.filter((line) => line.includes(': warning: ['));
}

export const RAW_NAMES = 'package demo;\nclass A {\n  java.util.List names;\n}\n';
