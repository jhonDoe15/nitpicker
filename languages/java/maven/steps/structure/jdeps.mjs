import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJavaTool } from '../java-tool.mjs';

const EXCLUDED = /(?:^|\/)(?:module-info|package-info)\.class$/u;

function classNames(classesDirectory) {
  if (!existsSync(classesDirectory)) {
    return [];
  }
  return readdirSync(classesDirectory, { recursive: true })
    .map((name) => name.split(path.sep).join('/'))
    .filter((name) => name.endsWith('.class') && !EXCLUDED.test(name))
    .map((name) => name.replace(/\.class$/u, '').replaceAll('/', '.'))
    .sort();
}

export function runJdeps(context) {
  const { module, reportRoot, javaHome } = context;
  const names = classNames(module.classesDirectory);
  writeFileSync(
    path.join(reportRoot, 'jdeps-classes.txt'),
    names.map((name) => `${name}\n`).join(''),
  );
  const graph = path.join(reportRoot, 'jdeps.txt');
  if (names.length === 0) {
    writeFileSync(graph, '');
    return;
  }
  runJavaTool(context, {
    label: 'jdeps',
    command: javaCommand(javaHome, 'jdeps'),
    args: ['-verbose:class', '-filter:none', module.classesDirectory],
    stdoutFile: graph,
    okExit: [0],
  });
}
