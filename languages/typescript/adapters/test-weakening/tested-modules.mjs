import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { runGit } from '../../../../core/diff/git.mjs';
import { projectCompilerOptions, resolveProjectModule } from './module-resolution.mjs';

function isFile(filePath) {
  return existsSync(filePath) && statSync(filePath).isFile();
}

function nameStatusEntries(output) {
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [status, from, to = from] = line.split('\t');
      return { status: status[0], from, to };
    });
}

function changedTestPaths({ baselineRoot, projectRoot }, layout) {
  const baseCommit = runGit(baselineRoot, ['rev-parse', 'HEAD']).trim();
  const output = runGit(projectRoot, [
    '-c',
    'core.quotePath=false',
    'diff',
    '--name-status',
    '--find-renames',
    '--relative',
    '--no-color',
    '--no-ext-diff',
    baseCommit,
    'HEAD',
  ]);
  const entries = nameStatusEntries(output);
  return {
    head: entries
      .filter(({ status, to }) => status !== 'D' && layout.isTestFile(to))
      .map(({ to }) => to),
    base: entries
      .filter(({ status, from }) => !['A', 'C'].includes(status) && layout.isTestFile(from))
      .map(({ from }) => from),
  };
}

function importedSourceModules({ root, compilerOptions }, testPath, layout) {
  const text = readFileSync(path.join(root, testPath), 'utf8');
  const context = { root, compilerOptions, fromFile: testPath };
  return ts
    .preProcessFile(text, true, true)
    .importedFiles.map(({ fileName }) => resolveProjectModule(context, fileName))
    .filter((modulePath) => modulePath !== undefined && layout.isSourceFile(modulePath));
}

export function testedSourceModules(options, layout) {
  const { snapshot, baselineRoot, projectRoot } = options;
  if (snapshot === 'base' || baselineRoot === undefined) return [];
  const changed = changedTestPaths(options, layout);
  const head = { root: projectRoot, compilerOptions: projectCompilerOptions(projectRoot) };
  const base = { root: baselineRoot, compilerOptions: projectCompilerOptions(baselineRoot) };
  const modules = new Set([
    ...changed.head.flatMap((testPath) => importedSourceModules(head, testPath, layout)),
    ...changed.base.flatMap((testPath) => importedSourceModules(base, testPath, layout)),
  ]);
  return [...modules]
    .filter((modulePath) => isFile(path.join(baselineRoot, modulePath)))
    .filter((modulePath) => isFile(path.join(projectRoot, modulePath)))
    .sort();
}
