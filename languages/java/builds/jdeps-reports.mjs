import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const JDEPS_OUTPUT_BYTES = 50 * 1024 * 1024;
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

function jdepsOutput({ command, cwd, directories }) {
  const result = spawnSync(command, ['-verbose:class', '-filter:none', ...directories], {
    cwd,
    encoding: 'utf8',
    maxBuffer: JDEPS_OUTPUT_BYTES,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `jdeps failed with exit code ${String(result.status)}: ${result.error?.message ?? result.stderr}`,
    );
  }
  return result.stdout;
}

export function writeJdepsReports({ command, cwd, mainDirectory, testDirectory, reportDir }) {
  const mainClasses = classNamesIn(mainDirectory);
  const testClasses = classNamesIn(testDirectory);
  const directories = [
    ...(mainClasses.length > 0 ? [mainDirectory] : []),
    ...(testClasses.length > 0 ? [testDirectory] : []),
  ];
  const edges =
    directories.length === 0
      ? { main: '', test: '' }
      : splitJdepsEdges(jdepsOutput({ command, cwd, directories }), { mainClasses, testClasses });
  writeFileSync(path.join(reportDir, 'jdeps.txt'), edges.main);
  writeFileSync(path.join(reportDir, 'jdeps-test.txt'), edges.test);
  writeFileSync(
    path.join(reportDir, 'jdeps-classes.txt'),
    mainClasses.map((name) => `${name}\n`).join(''),
  );
}
