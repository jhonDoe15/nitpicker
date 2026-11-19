import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { classSummaries } from '../classes/class-summary.mts';
import {
  languageLevelOf,
  lintCompatibleOf,
  lintCompilerOf,
  posixOf as posix,
} from '../typed/compiled/javac-views.mts';
import { lombokPath } from './lint-arguments.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { type LintPlan } from '../typed/lint-plan.mts';
import { inheritedLombokConfigs, lombokConfigs } from './lint-staging.mts';

const lombokJars: (plan: LintPlan) => string[] = lombokPath;

export const LINT_CACHE = 'javac-lint.txt';
export const LINT_FINGERPRINT = 'javac-lint-fingerprint.txt';
const WARNING_FILE = /^(.+\.java):\d+: warning: \[/u;
const NO_REUSE: Reuse = { unchanged: new Set(), kept: '' };

type Summary = {
  readonly name: string;
  readonly sourceFile: string | undefined;
  readonly superName: string | undefined;
  readonly interfaces: readonly string[];
  readonly references: ReadonlySet<string>;
};
type Reuse = { readonly unchanged: ReadonlySet<string>; readonly kept: string };
type ReuseRequest = {
  readonly baselineRoot: string | undefined;
  readonly sources: readonly string[];
  readonly fingerprint: string;
  readonly reportPath: (file: string) => string;
};
const readSummaries: (directories: readonly string[]) => Summary[] = classSummaries;

function javacVersion(javac: string, spawn: unknown = spawnSync): string {
  const result = callUntyped(spawn, javac, ['-version'], { encoding: 'utf8' });
  const lines = [fieldOf(result, 'stdout'), fieldOf(result, 'stderr')].join('').split(/\r?\n/u);
  return lines.filter((line) => line.startsWith('javac')).join('\n');
}

function insideRoot(root: string, entry: string): boolean {
  const relative = path.relative(root, entry);
  return !(relative.startsWith('..') || path.isAbsolute(relative));
}

function fileDigest(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function directoryDigest(directory: string): string {
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
  return files
    .reduce(
      (hash, file) =>
        hash.update(`${posix(path.relative(directory, file))}\0`).update(readFileSync(file)),
      createHash('sha256'),
    )
    .digest('hex');
}

function entryDigest(root: string, entry: string): string {
  const name = insideRoot(root, entry) ? posix(path.relative(root, entry)) : path.basename(entry);
  if (!existsSync(entry)) {
    return `${name} missing`;
  }
  return `${name} ${statSync(entry).isDirectory() ? directoryDigest(entry) : fileDigest(entry)}`;
}

function digests(root: string, entries: readonly string[]): string[] {
  return entries.map((entry) => entryDigest(root, entry)).sort();
}

export function lintFingerprint(plan: LintPlan): string {
  const sources = plan.sources.filter((source) => insideRoot(plan.root, source));
  const inputs = {
    javac: javacVersion(plan.javac, plan.spawn),
    level: languageLevelOf(lintCompilerOf(plan)),
    encoding: plan.compiler.encoding ?? 'UTF-8',
    args: lintCompatibleOf(lintCompilerOf(plan).args).map((arg) =>
      arg.replaceAll(plan.root, '<root>'),
    ),
    classpath: digests(plan.root, plan.classpath),
    lombok: digests(plan.root, lombokJars(plan)),
    lombokConfigs: digests(plan.root, lombokConfigs({ root: plan.root, sources })),
    inheritedLombokConfigs: inheritedLombokConfigs(plan.root).map((config) => fileDigest(config)),
  };
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
}

function ownerKey({ name, sourceFile }: Summary): string {
  const slash = name.lastIndexOf('/');
  const file = sourceFile ?? `${String(name.slice(slash + 1).split('$')[0])}.java`;
  return slash < 0 ? file : `${name.slice(0, slash)}/${file}`;
}

function ownedBy(summary: Summary, files: readonly string[]): string[] {
  const key = ownerKey(summary);
  return files.filter((file) => {
    const name = posix(file);
    return name === key || name.endsWith(`/${key}`);
  });
}

function withSubtypes(summaries: readonly Summary[], names: ReadonlySet<string>): Set<string> {
  const marked = new Set(names);
  const pending = [...marked];
  for (const name of pending) {
    const subtypes = summaries.filter(
      (summary) =>
        !marked.has(summary.name) && [summary.superName, ...summary.interfaces].includes(name),
    );
    for (const subtype of subtypes) {
      marked.add(subtype.name);
      pending.push(subtype.name);
    }
  }
  return marked;
}

function dependentSources(
  classDirectory: string,
  {
    changed,
    unchanged,
  }: { readonly changed: readonly string[]; readonly unchanged: readonly string[] },
): Set<string> {
  if (changed.length === 0 || unchanged.length === 0) {
    return new Set();
  }
  const summaries = readSummaries([classDirectory]);
  const changedNames = withSubtypes(
    summaries,
    new Set(
      summaries
        .filter((summary) => ownedBy(summary, changed).length > 0)
        .map((summary) => summary.name),
    ),
  );
  return new Set(
    summaries
      .filter((summary) => [...summary.references].some((name) => changedNames.has(name)))
      .flatMap((summary) => ownedBy(summary, unchanged)),
  );
}

function warningsOf(report: string, files: ReadonlySet<string | undefined>): string {
  return readFileSync(report, 'utf8')
    .split(/\r?\n/u)
    .filter((line) => files.has(WARNING_FILE.exec(line)?.[1]))
    .map((line) => `${line}\n`)
    .join('');
}

function sameBytes(before: string, after: string): boolean {
  return (
    existsSync(before) &&
    statSync(before).isFile() &&
    readFileSync(before).equals(readFileSync(after))
  );
}

export function reusableWarnings(
  plan: LintPlan,
  { baselineRoot, sources, fingerprint, reportPath }: ReuseRequest,
): Reuse {
  if (baselineRoot === undefined) {
    return NO_REUSE;
  }
  const baseline: string = baselineRoot;
  function inBaseline(file: string): string {
    return path.join(baseline, path.relative(plan.root, file));
  }
  const cache = inBaseline(path.join(plan.cacheDirectory, LINT_CACHE));
  const stored = inBaseline(path.join(plan.cacheDirectory, LINT_FINGERPRINT));
  if (!existsSync(cache) || !existsSync(stored) || readFileSync(stored, 'utf8') !== fingerprint) {
    return NO_REUSE;
  }
  const same = sources.filter((source) => sameBytes(inBaseline(source), source));
  const changed = sources.filter((source) => !same.includes(source));
  const affected = dependentSources(plan.classDirectory, { changed, unchanged: same });
  const unchanged = new Set(same.filter((source) => !affected.has(source)));
  return {
    unchanged,
    kept: warningsOf(cache, new Set([...unchanged].map((source) => reportPath(source)))),
  };
}
