import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JVM_NOISE, javaCommand } from '../maven-command.mjs';
import { toolCommand } from '../../builds/tools/tool-commands.mjs';

const MODULE_INFO = 'module-info.class';
const MAX_ERROR_LINES = 10;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const ERROR_LINE = /Error|Exception|Caused by/u;

function classFiles(directory) {
  const pending = [''];
  const files = [];
  for (const below of pending) {
    const entries = readdirSync(path.join(directory, below), { withFileTypes: true });
    function relative(entry) {
      return path.posix.join(below, entry.name);
    }
    pending.push(...entries.filter((entry) => entry.isDirectory()).map(relative));
    files.push(
      ...entries.filter((entry) => entry.isFile() && entry.name.endsWith('.class')).map(relative),
    );
  }
  return files;
}

function mainClasses(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return classFiles(directory)
    .filter((file) => ![MODULE_INFO, 'package-info.class'].includes(path.posix.basename(file)))
    .map((file) => file.replace(/\.class$/u, '').replaceAll('/', '.'))
    .sort();
}

function jdepsFailure(result) {
  const lines = result.stderr
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '' && !JVM_NOISE.test(line));
  const errors = lines.filter((line) => ERROR_LINE.test(line));
  const detail = (errors.length > 0 ? errors : lines).slice(0, MAX_ERROR_LINES).join('\n');
  return new Error(`jdeps failed with exit code ${String(result.status)}: ${detail}`);
}

function analyzeClasses(module, classes) {
  const command = toolCommand('jdeps', { classDirectories: [classes] });
  const result = spawnSync(javaCommand('jdeps'), command.args, {
    cwd: module.basedir,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (!command.accepts(result.status)) {
    throw jdepsFailure(result);
  }
  return result.stdout;
}

function isStagedClass(source) {
  const entry = lstatSync(source);
  return (
    entry.isDirectory() ||
    (entry.isFile() && source.endsWith('.class') && path.basename(source) !== MODULE_INFO)
  );
}

function stagingParent({ outputDirectory, buildDirectory }) {
  const below = path.relative(outputDirectory, buildDirectory);
  const inside = below !== '..' && !below.startsWith(`..${path.sep}`) && !path.isAbsolute(below);
  return inside ? tmpdir() : buildDirectory;
}

function analyzeWithoutModuleInfo(module) {
  mkdirSync(module.buildDirectory, { recursive: true });
  const outputDirectory = realpathSync(module.outputDirectory);
  const parent = stagingParent({
    outputDirectory,
    buildDirectory: realpathSync(module.buildDirectory),
  });
  const staged = mkdtempSync(path.join(parent, 'nitpicker-jdeps-'));
  try {
    const classes = path.join(staged, 'classes');
    cpSync(outputDirectory, classes, { recursive: true, filter: isStagedClass });
    return analyzeClasses(module, classes);
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
}

export function runJdeps(module, reportDir) {
  const classes = mainClasses(module.outputDirectory);
  writeFileSync(
    path.join(reportDir, 'jdeps-classes.txt'),
    classes.map((name) => `${name}\n`).join(''),
  );
  if (classes.length === 0) {
    writeFileSync(path.join(reportDir, 'jdeps.txt'), '');
    return;
  }
  const modular = existsSync(path.join(module.outputDirectory, MODULE_INFO));
  const graph = modular
    ? analyzeWithoutModuleInfo(module)
    : analyzeClasses(module, module.outputDirectory);
  writeFileSync(path.join(reportDir, 'jdeps.txt'), graph);
}
