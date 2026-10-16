import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { classSummaries } from '../classes/class-summary.mjs';
import { languageLevel, lintCompatible } from './javac-options.mjs';
import { lombokPath } from './lint-arguments.mjs';

export const LINT_CACHE = 'javac-lint.txt';
export const LINT_FINGERPRINT = 'javac-lint-fingerprint.txt';
const WARNING_FILE = /^(.+\.java):\d+: warning: \[/u;
const NO_REUSE = { unchanged: new Set(), kept: '' };
const javacVersions = new Map();

function posix(file) {
  return file.split(path.sep).join('/');
}

function javacVersion(javac) {
  if (!javacVersions.has(javac)) {
    const result = spawnSync(javac, ['-version'], { encoding: 'utf8' });
    const lines = `${result.stdout ?? ''}${result.stderr ?? ''}`.split(/\r?\n/u);
    javacVersions.set(javac, lines.filter((line) => line.startsWith('javac')).join('\n'));
  }
  return javacVersions.get(javac);
}

function entryName(root, entry) {
  const relative = path.relative(root, entry);
  return relative.startsWith('..') || path.isAbsolute(relative)
    ? path.basename(entry)
    : posix(relative);
}

function directoryDigest(directory) {
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

function entryDigest(root, entry) {
  const name = entryName(root, entry);
  if (!existsSync(entry)) {
    return `${name} missing`;
  }
  const stats = statSync(entry);
  return stats.isDirectory() ? `${name} ${directoryDigest(entry)}` : `${name} ${stats.size}`;
}

export function lintFingerprint(plan) {
  const inputs = {
    javac: javacVersion(plan.javac),
    level: languageLevel(plan.compiler),
    encoding: plan.compiler.encoding ?? 'UTF-8',
    args: lintCompatible(plan.compiler.args),
    classpath: plan.classpath.map((entry) => entryDigest(plan.root, entry)).sort(),
    lombok: lombokPath(plan)
      .map((entry) => entryDigest(plan.root, entry))
      .sort(),
  };
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
}

function ownerKey({ name, sourceFile }) {
  const slash = name.lastIndexOf('/');
  const file = sourceFile ?? `${name.slice(slash + 1).split('$')[0]}.java`;
  return slash < 0 ? file : `${name.slice(0, slash)}/${file}`;
}

function ownedBy(summary, files) {
  const key = ownerKey(summary);
  return files.filter((file) => {
    const name = posix(file);
    return name === key || name.endsWith(`/${key}`);
  });
}

function withSubtypes(summaries, names) {
  const added = summaries.filter(
    (summary) =>
      !names.has(summary.name) &&
      [summary.superName, ...summary.interfaces].some((name) => names.has(name)),
  );
  return added.length === 0
    ? names
    : withSubtypes(summaries, new Set([...names, ...added.map((summary) => summary.name)]));
}

export function dependentSources(classDirectory, { changed, unchanged }) {
  if (changed.length === 0 || unchanged.length === 0) {
    return new Set();
  }
  const summaries = classSummaries([classDirectory]);
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

function warningsOf(report, files) {
  return readFileSync(report, 'utf8')
    .split(/\r?\n/u)
    .filter((line) => files.has(WARNING_FILE.exec(line)?.[1]))
    .map((line) => `${line}\n`)
    .join('');
}

function sameBytes(before, after) {
  return (
    existsSync(before) &&
    statSync(before).isFile() &&
    readFileSync(before).equals(readFileSync(after))
  );
}

export function reusableWarnings(plan, { baselineRoot, sources, fingerprint, reportPath }) {
  if (baselineRoot === undefined) {
    return NO_REUSE;
  }
  const inBaseline = (file) => path.join(baselineRoot, path.relative(plan.root, file));
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
