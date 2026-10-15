import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readZip } from '../../builds/zip-entries.mjs';
import { javaCommand } from '../maven-command.mjs';
import { javaFiles } from '../maven-lint.mjs';

const LINT_REPORT = 'javac-lint.txt';
const LINT_FAILURE = 'javac-lint-failed.txt';
const MODULE_INFO = 'module-info.java';
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const LINT_TIMEOUT_MS = 15 * 60 * 1000;
const PAIRED_OPTIONS = new Set([
  '-Xmaxwarns',
  '-Xmaxerrs',
  '-processor',
  '-processorpath',
  '--processor-path',
  '--processor-module-path',
  '--module-path',
  '-p',
  '-d',
  '-s',
  '-h',
  '-encoding',
]);
const DROPPED_PREFIXES = ['-Xlint', '-Xdoclint', '-proc:', '-implicit:', '-Xplugin:'];
const SUPPRESS_WARNINGS = /@\s*(?:java\s*\.\s*lang\s*\.\s*)?SuppressWarnings\s*\([^)]*\)/gu;
const WARNING_FILE = /^(.+\.java):\d+: warning: \[/u;
const VERSIONED_MODULE_INFO = /^META-INF\/versions\/\d+\/module-info\.class$/u;

export function lintCompatible(args) {
  const kept = [];
  let skipNext = false;
  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
    } else if (PAIRED_OPTIONS.has(arg)) {
      skipNext = true;
    } else if (arg !== '-Werror' && !DROPPED_PREFIXES.some((prefix) => arg.startsWith(prefix))) {
      kept.push(arg);
    }
  }
  return kept;
}

export function languageLevel(compiler) {
  if (compiler.release !== undefined) {
    return ['--release', compiler.release];
  }
  if (compiler.args.some((arg) => arg === '--release' || arg.startsWith('--release='))) {
    return [];
  }
  const given = (names) => compiler.args.some((arg) => names.includes(arg));
  return [
    ...(compiler.source === undefined || given(['-source', '--source'])
      ? []
      : ['-source', compiler.source]),
    ...(compiler.target === undefined || given(['-target', '--target'])
      ? []
      : ['-target', compiler.target]),
  ];
}

export function isJavaModule(file) {
  if (statSync(file).isDirectory()) {
    return existsSync(path.join(file, 'module-info.class'));
  }
  if (!file.endsWith('.jar')) {
    return false;
  }
  const jar = readZip(file);
  return (
    jar.names.has('module-info.class') ||
    /^Automatic-Module-Name:/mu.test(jar.text('META-INF/MANIFEST.MF') ?? '') ||
    [...jar.names].some((name) => VERSIONED_MODULE_INFO.test(name))
  );
}

function lookupPath({ modular, classesDir, libraries }) {
  const existing = libraries.filter((library) => existsSync(library));
  if (!modular) {
    return ['-cp', [classesDir, ...existing].join(path.delimiter)];
  }
  const modules = existing.filter((library) => isJavaModule(library));
  const plain = existing.filter((library) => !modules.includes(library));
  return [
    ...(modules.length === 0 ? [] : ['--module-path', modules.join(path.delimiter)]),
    ...(plain.length === 0 ? [] : ['-cp', plain.join(path.delimiter)]),
  ];
}

function relativeTo(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function unchangedSince(baselineDir, { basedir, sources }) {
  return new Set(
    sources
      .map((source) => ({ source, relative: relativeTo(basedir, source) }))
      .filter(({ source, relative }) => {
        const before = path.join(baselineDir, relative);
        return (
          !relative.startsWith('..') &&
          existsSync(before) &&
          statSync(before).isFile() &&
          readFileSync(before).equals(readFileSync(source))
        );
      })
      .map(({ relative }) => relative),
  );
}

function warningsOf(report, files) {
  return readFileSync(report, 'utf8')
    .split(/\r?\n/u)
    .filter((line) => files.has(WARNING_FILE.exec(line)?.[1]))
    .map((line) => `${line}\n`)
    .join('');
}

function baselineWarnings({ module, baselineDir, sources, output }) {
  const report =
    baselineDir === undefined
      ? undefined
      : path.join(baselineDir, relativeTo(module.basedir, output));
  if (report === undefined || !existsSync(report)) {
    return { unchanged: new Set(), kept: '' };
  }
  const unchanged = unchangedSince(baselineDir, { basedir: module.basedir, sources });
  return { unchanged, kept: warningsOf(report, unchanged) };
}

function stageSources({ module, sources, staged }) {
  const decoder = new TextDecoder(module.compiler.encoding ?? 'utf-8');
  return sources.map((source) => {
    const relative = relativeTo(module.basedir, source);
    const target = path.join(staged, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    const text = decoder.decode(readFileSync(source));
    writeFileSync(
      target,
      text.replaceAll(SUPPRESS_WARNINGS, (match) => match.replaceAll(/[^\n]/gu, ' ')),
    );
    return target;
  });
}

function lintArguments({ module, classpaths, classes, modular }) {
  const lombok = classpaths.mainCompile.filter(
    (entry) => existsSync(entry) && path.basename(entry).startsWith('lombok'),
  );
  return [
    '-Xlint:rawtypes,unchecked,deprecation,removal,cast',
    '-Xmaxwarns',
    '100000',
    '-Xmaxerrs',
    '100',
    '-implicit:none',
    '-XDshould-stop.ifNoError=FLOW',
    '-encoding',
    'UTF-8',
    '-d',
    classes,
    ...lookupPath({ modular, classesDir: module.outputDirectory, libraries: classpaths.mainCompile }),
    ...(lombok.length === 0 ? ['-proc:none'] : ['-processorpath', lombok.join(path.delimiter)]),
    ...languageLevel(module.compiler),
    ...lintCompatible(module.compiler.args),
  ];
}

function compileForLint({ work, args, files }) {
  const argumentFile = path.join(work, 'javac.args');
  writeFileSync(
    argumentFile,
    [...args, ...files]
      .map((token) => `"${token.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
      .join('\n'),
  );
  const result = spawnSync(javaCommand('javac'), [`@${argumentFile}`], {
    cwd: path.join(work, 'sources'),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: LINT_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return { code: result.status, log: `${result.stdout}${result.stderr}` };
}

function lintSources(context, sources) {
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-javac-lint-'));
  try {
    const staged = path.join(work, 'sources');
    const classes = path.join(work, 'classes');
    mkdirSync(classes, { recursive: true });
    const files = stageSources({ module: context.module, sources, staged });
    const args = lintArguments({ ...context, classes });
    const result = compileForLint({ work, args, files });
    return { ...result, log: result.log.replaceAll(staged + path.sep, '') };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function runJavacLint({ module, reportDir, classpaths, baselineDir }) {
  const output = path.join(reportDir, LINT_REPORT);
  const failure = path.join(reportDir, LINT_FAILURE);
  rmSync(output, { force: true });
  rmSync(failure, { force: true });
  const java = javaFiles(module.sourceRoots);
  const moduleInfo = java.find((file) => path.basename(file) === MODULE_INFO);
  const all = java.filter((file) => file !== moduleInfo);
  const { unchanged, kept } =
    moduleInfo === undefined
      ? baselineWarnings({ module, baselineDir, sources: all, output })
      : { unchanged: new Set(), kept: '' };
  const sources = [
    ...all.filter((file) => !unchanged.has(relativeTo(module.basedir, file))),
    ...(moduleInfo === undefined ? [] : [moduleInfo]),
  ];
  if (sources.length === 0) {
    writeFileSync(output, kept);
    return;
  }
  const result = lintSources({ module, classpaths, modular: moduleInfo !== undefined }, sources);
  writeFileSync(result.code === 0 ? output : failure, result.code === 0 ? kept + result.log : result.log);
}
