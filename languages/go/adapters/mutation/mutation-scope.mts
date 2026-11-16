import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseChangedLines as untypedParseChangedLines } from '../../../../core/diff/git/patches/changed-lines.mjs';
import { runGit } from '../../../../core/diff/git/repository/command.mjs';
import { diffFromBase as untypedDiffFromBase } from '../../../../core/tooling/git/base-diff.mjs';
import { run } from '../execution/go-process.mts';
import { inspectCommand } from '../execution/go-tools.mts';
import { moduleFileText } from '../execution/go-module.mts';
import { globMatcher as untypedGlobMatcher } from '../../../../shared/paths/glob.mjs';
import { fieldOf, listOf, parseJson } from '../../../../shared/values/readers.mts';
import type { GoContext } from '../go-types.mts';
import type { ChangedRange, LineScope, Mutant, Scope, Tested } from './mutation-types.mts';

type ChangedFile = { path: string; ranges: readonly ChangedRange[] };
type Targets = { all: boolean; files: Readonly<Record<string, readonly ChangedRange[]>> };

const parseChangedLines: (diff: string) => ReadonlyMap<string, ChangedFile> =
  untypedParseChangedLines;
const diffFromBase: (options: {
  runGit: unknown;
  baselineRoot: string;
  projectRoot: string;
  args: readonly string[];
}) => string = untypedDiffFromBase;
const globMatcher: (glob: string) => { test: (file: string) => boolean } = untypedGlobMatcher;

const GO_SOURCE = /(?<!_test)\.go$/u;
const GO_TEST = /_test\.go$/u;
const SECTION_HEADER = /^diff --git a\/(?<from>.+) b\/(?<to>.+)$/mu;
const WHOLE_FILE: readonly ChangedRange[] = [[1, Number.MAX_SAFE_INTEGER]];

function isMutant(value: unknown): value is Mutant {
  return (
    typeof fieldOf(value, 'file') === 'string' && typeof fieldOf(value, 'operator') === 'string'
  );
}

function weakenedFolders(diff: string) {
  const folders = new Set<string>();
  for (const section of diff.split(/^(?=diff --git )/mu)) {
    const header = SECTION_HEADER.exec(section)?.groups;
    if (header === undefined || /^(?:new file mode|similarity index 100%)/mu.test(section)) {
      continue;
    }
    for (const file of [header['from'] ?? '', header['to'] ?? ''].filter((name) =>
      GO_TEST.test(name),
    )) {
      folders.add(path.posix.dirname(file));
    }
  }
  return folders;
}

export function changeScope(context: GoContext): Scope {
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

export function onChangedLine(
  scope: LineScope,
  mutant: Pick<Mutant, 'file' | 'line' | 'endLine'>,
): boolean {
  return (
    scope.all ||
    (scope.changed?.get(mutant.file) ?? []).some(
      ([first = 0, last = 0]) => first <= (mutant.endLine ?? mutant.line) && mutant.line <= last,
    )
  );
}

export const MAX_TESTED_FILES = 10;

export function testedFiles(
  context: GoContext,
  { scope, compiledFiles }: { scope: Scope; compiledFiles: ReadonlySet<string> },
): Tested {
  const files = [...compiledFiles]
    .filter((file) => scope.testedFolders.has(path.posix.dirname(file)))
    .filter((file) => moduleFileText(context.baselineRoot, file) !== undefined)
    .toSorted((left, right) => left.localeCompare(right));
  return { files: files.slice(0, MAX_TESTED_FILES), capped: files.slice(MAX_TESTED_FILES) };
}

function targetsOf(scope: Scope, whole: readonly string[]): Targets {
  if (scope.all) {
    return { all: true, files: {} };
  }
  return {
    all: false,
    files: {
      ...Object.fromEntries(scope.changed),
      ...Object.fromEntries(whole.map((file) => [file, WHOLE_FILE])),
    },
  };
}

function excludedBy(context: GoContext) {
  const matchers = context.exclude.map((glob) => globMatcher(glob));
  return (file: string) => matchers.some((matcher) => matcher.test(file));
}

export function generateMutants(
  context: GoContext,
  {
    root = context.projectRoot,
    scope,
    compiledFiles,
    whole,
  }: {
    root?: string | undefined;
    scope: Scope;
    compiledFiles: ReadonlySet<string>;
    whole: readonly string[];
  },
): Mutant[] {
  const name = root === context.projectRoot ? 'head' : 'base';
  const targetsFile = path.join(context.reportRoot, `mutation-targets-${name}.json`);
  const mutantsFile = path.join(context.reportRoot, `mutants-${name}.json`);
  writeFileSync(targetsFile, JSON.stringify(targetsOf(scope, whole)));
  run(context, [inspectCommand(context), 'mutants', root, targetsFile, mutantsFile], {
    rule: 'mutation-failed',
  });
  const excluded = excludedBy(context);
  return listOf(parseJson(readFileSync(mutantsFile, 'utf8')))
    .filter(isMutant)
    .filter(({ file }) => compiledFiles.has(file) && !excluded(file));
}

export function lineReader(root: string | undefined): (file: string, line: number) => string {
  const files = new Map<string, string[]>();
  return (file: string, line: number) => {
    if (!files.has(file)) {
      files.set(file, (moduleFileText(root, file) ?? '').split(/\r?\n/u));
    }
    return (files.get(file)?.[line - 1] ?? '').trim();
  };
}
