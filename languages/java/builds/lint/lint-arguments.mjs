import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { readZipOrFailure } from '../zip-entries.mjs';
import { languageLevel, lintCompatible, lintCompiler } from './javac-options.mjs';

const VERSIONED_MODULE_INFO = /^META-INF\/versions\/\d+\/module-info\.class$/u;
const LINT_FLAGS = [
  '-Xlint:rawtypes,unchecked,deprecation,removal,cast',
  '-Xmaxwarns',
  '100000',
  '-Xmaxerrs',
  '100',
  '-implicit:none',
  '-XDshould-stop.ifNoError=FLOW',
];

export function isJavaModule(file) {
  if (statSync(file).isDirectory()) {
    return existsSync(path.join(file, 'module-info.class'));
  }
  if (!file.endsWith('.jar')) {
    return false;
  }
  const read = readZipOrFailure(file);
  if (read.kind !== 'zip') {
    return false;
  }
  const jar = read.zip;
  return (
    jar.names.has('module-info.class') ||
    /^Automatic-Module-Name:/mu.test(jar.text('META-INF/MANIFEST.MF') ?? '') ||
    [...jar.names].some((name) => VERSIONED_MODULE_INFO.test(name))
  );
}

function lookupPath({ modular, classDirectory, libraries }) {
  const existing = libraries.filter((library) => existsSync(library));
  if (modular === false) {
    return ['-cp', [classDirectory, ...existing].join(path.delimiter)];
  }
  const modules =
    modular === 'all' ? existing : existing.filter((library) => isJavaModule(library));
  const plain = existing.filter((library) => !modules.includes(library));
  return [
    ...(modules.length === 0 ? [] : ['--module-path', modules.join(path.delimiter)]),
    ...(plain.length === 0 ? [] : ['-cp', plain.join(path.delimiter)]),
  ];
}

export function lombokPath(plan) {
  return plan.processorPath.filter(
    (entry) => existsSync(entry) && path.basename(entry).startsWith('lombok'),
  );
}

export function lintArguments(plan, { classes, modular }) {
  const lombok = lombokPath(plan);
  return [
    ...LINT_FLAGS,
    '-encoding',
    plan.compiler.encoding ?? 'UTF-8',
    '-d',
    classes,
    ...lookupPath({ modular, classDirectory: plan.classDirectory, libraries: plan.classpath }),
    ...(lombok.length === 0 ? ['-proc:none'] : ['-processorpath', lombok.join(path.delimiter)]),
    ...languageLevel(lintCompiler(plan)),
    ...lintCompatible(lintCompiler(plan).args),
  ];
}
