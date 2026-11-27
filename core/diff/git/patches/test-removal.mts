import path from 'node:path';
import { normalizeGitPath } from '../normalize.mts';
import { repositoryPath } from '../paths.mts';
import { readBlobTexts } from '../repository/blobs.mts';
import { runGit } from '../repository/command.mts';
import { RENAME_DETECTION, RENAME_LIMIT_SETTING } from './changes.mts';

const NUL = String.fromCodePoint(0);
const NUMSTAT_ENTRY = new RegExp(
  `(\\d+|-)\\t(\\d+|-)\\t(?:${NUL}([^${NUL}]*)${NUL})?([^${NUL}]+)${NUL}`,
  'gu',
);

const TEST_FILE = new RegExp(
  [
    String.raw`(?:^|/)(?:tests?|__tests__|specs?)/`,
    String.raw`\.(?:test|spec)\.[cm]?[jt]sx?$`,
    String.raw`(?:^|/)test_[^/]*\.py$`,
    String.raw`_test\.py$`,
    String.raw`(?:^|/)conftest\.py$`,
    String.raw`(?:Tests?|IT|Spec)\.(?:java|kt|kts|groovy|scala)$`,
  ].join('|'),
  'u',
);

export function isTestFile(file: string): boolean {
  return TEST_FILE.test(file);
}

export type NumstatEntry = {
  readonly added: number;
  readonly removed: number;
  readonly file: string;
  readonly baseFile?: string;
};

export function parseNumstat(output: string): NumstatEntry[] {
  return [...output.matchAll(NUMSTAT_ENTRY)].map(([, added, removed, baseFile, file]) => ({
    added: Number(added),
    removed: Number(removed),
    file: file ?? '',
    ...(baseFile === undefined ? {} : { baseFile }),
  }));
}

function removesTest({ added, removed, file }: NumstatEntry): boolean {
  return isTestFile(file) && Number.isFinite(removed) && removed > added;
}

export function removesTests(entries: readonly NumstatEntry[]): boolean {
  return entries.some(removesTest);
}

type DiffRange = {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headSha: string;
  readonly projectRelativePath: string;
  readonly baseProjectRelativePath?: string;
};

export function readRemovesTests(range: DiffRange): boolean {
  return removesTests(readNumstat(range));
}

export type TestRemoval = {
  readonly testsRemoved: boolean;
  readonly removedTestTargets: ReadonlySet<string> | undefined;
};

const IMPORT_SPECIFIER =
  /(?:\bfrom|\bimport|\brequire|\bmock|\bimportActual|\bdoMock)\s*(?:\(\s*)?(['"`])([^'"`\n]+)\1/gu;
const RELATIVE_SPECIFIER = /^\.\.?\//u;
const UNRESOLVABLE_SPECIFIER = /^(?:[#~/]|@\/)|\$\{|(?:^|\/)(?:\.\.?|index(?:\.[^/]*)?)\/?$/u;
const TEST_DATA =
  /\.(?:json|jsonc|json5|snap|txt|md|ya?ml|csv|tsv|xml|html|svg|png|jpe?g|gif|sql)$/iu;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const TYPESCRIPT_TWINS: Readonly<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

function candidatesOf(target: string): string[] {
  const extension = path.posix.extname(target);
  if (SOURCE_EXTENSIONS.includes(extension)) {
    const stem = target.slice(0, -extension.length);
    return [target, ...(TYPESCRIPT_TWINS[extension] ?? []).map((twin) => `${stem}${twin}`)];
  }
  return [
    target,
    ...SOURCE_EXTENSIONS.map((each) => `${target}${each}`),
    ...SOURCE_EXTENSIONS.map((each) => `${target}/index${each}`),
  ];
}

export function importedTargets(testFile: string, text: string): string[] | undefined {
  const directory = path.posix.dirname(testFile);
  const specifiers = [...text.matchAll(IMPORT_SPECIFIER)].map(
    ([, , specifier]) => (specifier ?? '').split('?')[0] ?? '',
  );
  if (specifiers.some((specifier) => UNRESOLVABLE_SPECIFIER.test(specifier))) {
    return undefined;
  }
  return specifiers
    .filter((specifier) => RELATIVE_SPECIFIER.test(specifier))
    .flatMap((specifier) => candidatesOf(normalizeGitPath(path.posix.join(directory, specifier))));
}

function insideProject(file: string, project: string): string | undefined {
  if (project === '') {
    return file.startsWith('../') ? undefined : file;
  }
  return file.startsWith(`${project}/`) ? file.slice(project.length + 1) : undefined;
}

export function removedTestTargetsOf(
  testFiles: readonly string[],
  texts: ReadonlyMap<string, string>,
  baseProject: string,
): ReadonlySet<string> | undefined {
  const targets = new Set<string>();
  const sources = testFiles.filter((file) => !TEST_DATA.test(file));
  for (const file of sources) {
    const text = texts.get(file);
    const imported = text === undefined ? undefined : importedTargets(file, text);
    const found = (imported ?? []).map((target) => insideProject(target, baseProject));
    if (found.length === 0 || found.includes(undefined)) {
      return undefined;
    }
    for (const target of found) {
      targets.add(target ?? '');
    }
  }
  return targets;
}

export function readTestRemoval(range: DiffRange): TestRemoval {
  const removed = readNumstat(range)
    .filter(removesTest)
    .map(({ file, baseFile }) => baseFile ?? file);
  if (removed.length === 0) {
    return { testsRemoved: false, removedTestTargets: undefined };
  }
  const specs = new Map(removed.map((file) => [`${range.mergeBaseSha}:${file}`, file]));
  const blobs = readBlobTexts(range.repositoryRoot, [...specs.keys()]);
  const texts = new Map([...blobs].map(([spec, text]) => [specs.get(spec) ?? spec, text]));
  const baseProject = repositoryPath(range.baseProjectRelativePath ?? range.projectRelativePath);
  return {
    testsRemoved: true,
    removedTestTargets: removedTestTargetsOf(removed, texts, baseProject),
  };
}

function readNumstat({
  repositoryRoot,
  mergeBaseSha,
  headSha,
  projectRelativePath,
  baseProjectRelativePath = projectRelativePath,
}: DiffRange): NumstatEntry[] {
  const output = runGit(repositoryRoot, [
    '-c',
    'core.quotePath=false',
    '-c',
    RENAME_LIMIT_SETTING,
    'diff',
    '--numstat',
    '-z',
    RENAME_DETECTION,
    '--no-color',
    '--no-ext-diff',
    `${mergeBaseSha}...${headSha}`,
    '--',
    ...new Set([projectRelativePath, baseProjectRelativePath]),
  ]);
  return parseNumstat(output);
}
