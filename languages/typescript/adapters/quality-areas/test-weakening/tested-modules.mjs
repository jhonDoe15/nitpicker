import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import { diffAgainstBase } from '../runners/mutation-scope.mjs';
import {
  isFile,
  projectCompilerOptions,
  resolveProjectModule,
  withReExportedModules,
} from './module-resolution.mjs';

export const MAX_TESTED_MODULES = 10;
const UNCHANGED_CONTENT = /^[CR]100$/u;

function nameStatusEntries(output) {
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [status, from, to = from] = line.split('\t');
      return { status, from, to };
    })
    .filter(({ status }) => !UNCHANGED_CONTENT.test(status));
}

function changedTestPaths(options, layout) {
  const entries = nameStatusEntries(diffAgainstBase(options, '--name-status'));
  return {
    head: entries
      .filter(({ status, to }) => status !== 'D' && layout.isTestFile(to))
      .map(({ to }) => to),
    base: entries
      .filter(({ status, from }) => !['A', 'C'].includes(status[0]) && layout.isTestFile(from))
      .map(({ from }) => from),
  };
}

function importedModules({ root, compilerOptions }, filePath) {
  const full = pathInside(root, filePath);
  if (full === undefined) {
    return [];
  }
  const text = readFileSync(full, 'utf8');
  const context = { root, compilerOptions, fromFile: filePath };
  return ts
    .preProcessFile(text, true, true)
    .importedFiles.map(({ fileName }) => resolveProjectModule(context, fileName))
    .filter((modulePath) => modulePath !== undefined);
}

function importedSourceModules(project, testPath, layout) {
  const direct = importedModules(project, testPath).filter(layout.isSourceFile);
  const directSet = new Set(direct);
  const reExported = withReExportedModules(project, direct, layout.isSourceFile).filter(
    (modulePath) => !directSet.has(modulePath),
  );
  return { direct, reExported };
}

function testImporters(project, layout) {
  const importers = new Map();
  for (const testPath of layout.projectCodeFiles(project.root).filter(layout.isTestFile)) {
    for (const imported of importedModules(project, testPath).filter(layout.isTestFile)) {
      importers.set(imported, [...(importers.get(imported) ?? []), testPath]);
    }
  }
  return importers;
}

function testsUsingHelpers(project, changedTests, layout) {
  const helpers = changedTests.filter((testPath) => !layout.isRunnableTestFile(testPath));
  if (helpers.length === 0) {
    return [];
  }
  const importers = testImporters(project, layout);
  const reached = new Set(helpers);
  for (const filePath of reached) {
    for (const importer of importers.get(filePath) ?? []) {
      reached.add(importer);
    }
  }
  return [...reached].filter((testPath) => layout.isRunnableTestFile(testPath));
}

function projectAt(root) {
  return { root, compilerOptions: projectCompilerOptions(root) };
}

export function testedSourceModules(options, layout) {
  const { snapshot, baselineRoot, projectRoot } = options;
  if (snapshot === 'base' || baselineRoot === undefined) {
    return { modules: [], skipped: [] };
  }
  const changed = changedTestPaths(options, layout);
  const head = projectAt(projectRoot);
  const base = projectAt(baselineRoot);
  const headTests = [...changed.head, ...testsUsingHelpers(head, changed.head, layout)];
  const imports = [
    ...headTests.map((testPath) => importedSourceModules(head, testPath, layout)),
    ...changed.base.map((testPath) => importedSourceModules(base, testPath, layout)),
  ];
  const candidates = [
    ...new Set([
      ...imports.flatMap(({ direct }) => direct),
      ...imports.flatMap(({ reExported }) => reExported),
    ]),
  ]
    .filter((modulePath) => isFile(path.join(baselineRoot, modulePath)))
    .filter((modulePath) => isFile(path.join(projectRoot, modulePath)));
  return {
    modules: candidates.slice(0, MAX_TESTED_MODULES).sort(),
    skipped: candidates.slice(MAX_TESTED_MODULES),
  };
}
