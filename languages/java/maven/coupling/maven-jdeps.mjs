import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readZipOrFailure } from '../../builds/zip-entries.mjs';
import { javaCommand } from '../maven-command.mjs';
import { javaRelease } from '../guards/maven-pmd.mjs';

const MODULE_INFO = 'module-info.class';
const VERSIONED_MODULE_INFO = /^META-INF\/versions\/\d+\/module-info\.class$/u;
const AUTOMATIC_MODULE_NAME = /^Automatic-Module-Name:\s*(\S+)/mu;
const VERSION_SUFFIX = /-(\d+(\.|$))/u;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;
const RELEASE_OPTION = /^(?:--release|-target|--target)(?:=|$)/u;
const FIRST_MODULAR_RELEASE = 9;
const MAX_ERROR_LINES = 10;
const KEYWORDS = new Set(
  [
    'abstract assert boolean break byte case catch char class const continue default do double else',
    'enum extends final finally float for goto if implements import instanceof int interface long',
    'native new package private protected public return short static strictfp super switch',
    'synchronized this throw throws transient try void volatile while true false null _',
  ]
    .join(' ')
    .split(' '),
);

function isLegalName(name) {
  return name.split('.').every((part) => IDENTIFIER.test(part) && !KEYWORDS.has(part));
}

function derivedModuleName(file) {
  const base = path.basename(file, '.jar');
  const version = VERSION_SUFFIX.exec(base);
  return (version === null ? base : base.slice(0, version.index))
    .replaceAll(/[^A-Za-z0-9]/gu, '.')
    .replaceAll(/\.{2,}/gu, '.')
    .replaceAll(/^\.|\.$/gu, '');
}

function hasLegalPackages(names) {
  return [...names]
    .filter((name) => name.endsWith('.class') && !name.startsWith('META-INF/'))
    .every((name) => {
      const directory = path.posix.dirname(name);
      return directory !== '.' && isLegalName(directory.replaceAll('/', '.'));
    });
}

function isJarModule(file) {
  const read = readZipOrFailure(file);
  if (read.kind !== 'zip') {
    return false;
  }
  const { names } = read.zip;
  if (names.has(MODULE_INFO) || [...names].some((name) => VERSIONED_MODULE_INFO.test(name))) {
    return true;
  }
  const declared = AUTOMATIC_MODULE_NAME.exec(read.zip.text('META-INF/MANIFEST.MF') ?? '');
  return isLegalName(declared?.[1] ?? derivedModuleName(file)) && hasLegalPackages(names);
}

export function isModulePathEntry(file) {
  if (!existsSync(file)) {
    return false;
  }
  if (statSync(file).isDirectory()) {
    return existsSync(path.join(file, MODULE_INFO));
  }
  return file.endsWith('.jmod') || (file.endsWith('.jar') && isJarModule(file));
}

function runtimeFeature() {
  const result = spawnSync(javaCommand('jdeps'), ['--version'], { encoding: 'utf8' });
  if (result.error !== undefined) {
    throw result.error;
  }
  const feature = Number(/^(\d+)/u.exec(result.stdout)?.[1]);
  if (!Number.isInteger(feature)) {
    throw new Error(`jdeps --version printed no Java version: ${result.stdout}${result.stderr}`);
  }
  return feature;
}

function multiRelease(compiler) {
  const explicit =
    compiler.release ?? compiler.target ?? compiler.args.find((arg) => RELEASE_OPTION.test(arg));
  return explicit === undefined
    ? runtimeFeature()
    : Math.max(FIRST_MODULAR_RELEASE, javaRelease(compiler));
}

export function jdepsModuleOptions(module, classpaths) {
  if (!existsSync(path.join(module.outputDirectory, MODULE_INFO))) {
    return [];
  }
  const modulePath = classpaths.mainCompile.filter((entry) => isModulePathEntry(entry));
  return [
    ...(modulePath.length === 0 ? [] : ['--module-path', modulePath.join(path.delimiter)]),
    '--multi-release',
    String(multiRelease(module.compiler)),
  ];
}

function mainClasses(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.class'))
    .filter((entry) => ![MODULE_INFO, 'package-info.class'].includes(entry.name))
    .map((entry) =>
      path
        .relative(directory, path.join(entry.parentPath, entry.name))
        .replaceAll('\\', '/')
        .replace(/\.class$/u, '')
        .replaceAll('/', '.'),
    )
    .sort();
}

export function runJdeps(module, reportDir, classpaths) {
  const classes = mainClasses(module.outputDirectory);
  writeFileSync(
    path.join(reportDir, 'jdeps-classes.txt'),
    classes.map((name) => `${name}\n`).join(''),
  );
  if (classes.length === 0) {
    writeFileSync(path.join(reportDir, 'jdeps.txt'), '');
    return;
  }
  const options = jdepsModuleOptions(module, classpaths);
  const result = spawnSync(
    javaCommand('jdeps'),
    ['-verbose:class', '-filter:none', ...options, module.outputDirectory],
    { cwd: module.basedir, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = result.stderr.split(/\r?\n/u).slice(0, MAX_ERROR_LINES).join('\n');
    throw new Error(`jdeps failed with exit code ${String(result.status)}: ${detail}`);
  }
  writeFileSync(path.join(reportDir, 'jdeps.txt'), result.stdout);
}
