import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseChangedLines } from '../../../../core/diff/git/patches/changed-lines.mjs';
import { runGit } from '../../../../core/diff/git/repository/command.mjs';
import { diffFromBase } from '../../../../core/tooling/git/base-diff.mjs';
import { run } from '../execution/go-process.mjs';
import { inspectCommand } from '../execution/go-tools.mjs';
import { moduleFileText } from '../execution/go-module.mjs';

const GO_SOURCE = /(?<!_test)\.go$/u;
const GO_TEST = /_test\.go$/u;
const SECTION_HEADER = /^diff --git a\/(?<from>.+) b\/(?<to>.+)$/mu;
const WHOLE_FILE = [[1, Number.MAX_SAFE_INTEGER]];

function weakenedFolders(diff) {
  const folders = new Set();
  for (const section of diff.split(/^(?=diff --git )/mu)) {
    const header = SECTION_HEADER.exec(section)?.groups;
    if (header === undefined || /^new file mode/mu.test(section)) {
      continue;
    }
    for (const file of [header.from, header.to].filter((name) => GO_TEST.test(name))) {
      folders.add(path.posix.dirname(file));
    }
  }
  return folders;
}

export function changeScope(context) {
  if (context.baselineRoot === undefined) {
    return { all: true, changed: new Map(), testedFolders: new Set() };
  }
  const diff = diffFromBase({
    runGit,
    baselineRoot: context.baselineRoot,
    projectRoot: context.projectRoot,
    args: ['--unified=0', '--find-renames', '--relative', '--no-color', '--no-ext-diff'],
  });
  const changed = new Map(
    [...parseChangedLines(diff).values()]
      .filter((file) => GO_SOURCE.test(file.path) && file.ranges.length > 0)
      .map((file) => [file.path, file.ranges]),
  );
  return { all: false, changed, testedFolders: weakenedFolders(diff) };
}

export function onChangedLine(scope, mutant) {
  return (
    scope.all ||
    (scope.changed.get(mutant.file) ?? []).some(
      ([first, last]) => first <= mutant.line && mutant.line <= last,
    )
  );
}

function targetsOf(scope, compiledFiles) {
  if (scope.all) {
    return { all: true, files: {} };
  }
  const whole = [...compiledFiles].filter((file) =>
    scope.testedFolders.has(path.posix.dirname(file)),
  );
  return {
    all: false,
    files: {
      ...Object.fromEntries(scope.changed),
      ...Object.fromEntries(whole.map((file) => [file, WHOLE_FILE])),
    },
  };
}

export function generateMutants(context, { root = context.projectRoot, scope, compiledFiles }) {
  const name = root === context.projectRoot ? 'head' : 'base';
  const targetsFile = path.join(context.reportRoot, `mutation-targets-${name}.json`);
  const mutantsFile = path.join(context.reportRoot, `mutants-${name}.json`);
  writeFileSync(targetsFile, JSON.stringify(targetsOf(scope, compiledFiles)));
  run(context, [inspectCommand(context), 'mutants', root, targetsFile, mutantsFile], {
    rule: 'mutation-failed',
  });
  return JSON.parse(readFileSync(mutantsFile, 'utf8')).filter(({ file }) =>
    compiledFiles.has(file),
  );
}

export function lineReader(root) {
  const files = new Map();
  return (file, line) => {
    if (!files.has(file)) {
      files.set(file, (moduleFileText(root, file) ?? '').split(/\r?\n/u));
    }
    return (files.get(file)[line - 1] ?? '').trim();
  };
}
