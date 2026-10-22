import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  cpSync,
  mkdtempSync,
  existsSync,
  fstatSync,
  openSync,
  readdirSync,
  readSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

const CHUNK_BYTES = 1024 * 1024;
const JDEPS_OUTPUT = 'jdeps-output.txt';
const EDGE = /^\s+(\S+)\s+->\s+\S+/u;
const SKIPPED_CLASSES = new Set(['module-info.class', 'package-info.class']);

export function classNamesIn(directory) {
  return existsSync(directory)
    ? readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.class'))
        .filter((entry) => !SKIPPED_CLASSES.has(entry.name))
        .map((entry) =>
          path
            .relative(directory, path.join(entry.parentPath, entry.name))
            .replaceAll('\\', '/')
            .replace(/\.class$/u, '')
            .replaceAll('/', '.'),
        )
        .sort()
    : [];
}

function sourceOf(line) {
  return EDGE.exec(line)[1];
}

function linesOf(selected) {
  return selected.map((line) => `${line}\n`).join('');
}

export function splitJdepsEdges(text, { mainClasses, testClasses }) {
  const main = new Set(mainClasses);
  const test = new Set(testClasses);
  const edges = text.split(/\r?\n/u).filter((line) => EDGE.test(line));
  return {
    main: linesOf(edges.filter((line) => main.has(sourceOf(line)))),
    test: linesOf(edges.filter((line) => !main.has(sourceOf(line)) && test.has(sourceOf(line)))),
  };
}

function runJdepsCommand({ command, cwd, directories, outputFile }) {
  const output = openSync(outputFile, 'w');
  try {
    const result = spawnSync(command, ['-verbose:class', '-filter:none', ...directories], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', output, 'pipe'],
    });
    if (result.error !== undefined || result.status !== 0) {
      throw new Error(
        `jdeps failed with exit code ${String(result.status)}: ${result.error?.message ?? result.stderr}`,
      );
    }
  } finally {
    closeSync(output);
  }
}

function runJdeps(context) {
  if (
    !context.directories.some((directory) => existsSync(path.join(directory, 'module-info.class')))
  ) {
    runJdepsCommand(context);
    return;
  }
  const staged = mkdtempSync(path.join(tmpdir(), 'nitpicker-jdeps-'));
  try {
    const directories = context.directories.map((directory, index) => {
      const base = path.resolve(staged);
      const target = path.resolve(base, String(index));
      if (!target.startsWith(base + path.sep)) {
        throw new Error('Class staging target is outside its directory');
      }
      cpSync(directory, target, {
        recursive: true,
        filter: (file) => path.basename(file) !== 'module-info.class',
      });
      return target;
    });
    runJdepsCommand({ ...context, directories });
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
}

function chunkStarts(descriptor) {
  const size = fstatSync(descriptor).size;
  return Array.from({ length: Math.ceil(size / CHUNK_BYTES) }, (_, index) => index * CHUNK_BYTES);
}

function splitFile(file, classes, targets) {
  const input = openSync(file, 'r');
  const decoder = new StringDecoder('utf8');
  const buffer = Buffer.alloc(CHUNK_BYTES);
  let rest = '';
  function write(text) {
    const edges = splitJdepsEdges(text, classes);
    writeSync(targets.main, edges.main);
    writeSync(targets.test, edges.test);
  }
  try {
    for (const position of chunkStarts(input)) {
      const lines = (
        rest + decoder.write(buffer.subarray(0, readSync(input, buffer, 0, CHUNK_BYTES, position)))
      ).split('\n');
      rest = lines.pop();
      write(lines.join('\n'));
    }
    write(rest + decoder.end());
  } finally {
    closeSync(input);
  }
}

function writeEdges({ command, cwd, directories, reportDir }, classes) {
  const targets = {
    main: openSync(path.join(reportDir, 'jdeps.txt'), 'w'),
    test: openSync(path.join(reportDir, 'jdeps-test.txt'), 'w'),
  };
  const outputFile = path.join(reportDir, JDEPS_OUTPUT);
  try {
    if (directories.length > 0) {
      runJdeps({ command, cwd, directories, outputFile });
      splitFile(outputFile, classes, targets);
    }
  } finally {
    closeSync(targets.main);
    closeSync(targets.test);
    rmSync(outputFile, { force: true });
  }
}

export function writeJdepsReports({ command, cwd, mainDirectory, testDirectory, reportDir }) {
  const mainClasses = classNamesIn(mainDirectory);
  const testClasses = classNamesIn(testDirectory);
  const directories = [
    ...(mainClasses.length > 0 ? [mainDirectory] : []),
    ...(testClasses.length > 0 ? [testDirectory] : []),
  ];
  writeEdges({ command, cwd, directories, reportDir }, { mainClasses, testClasses });
  writeFileSync(
    path.join(reportDir, 'jdeps-classes.txt'),
    mainClasses.map((name) => `${name}\n`).join(''),
  );
}
