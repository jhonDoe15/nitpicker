import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { classSummaries } from '../classes/class-summary.mjs';
import { languageLevel, lintCompatible } from './javac-options.mjs';
import { lombokPath } from './lint-arguments.mjs';
import { lombokConfigs, rootLombokConfig } from './lint-staging.mjs';

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
    const lines = [result.stdout, result.stderr].join('').split(/\r?\n/u);
    javacVersions.set(javac, lines.filter((line) => line.startsWith('javac')).join('\n'));
  }
  return javacVersions.get(javac);
}

function insideRoot(root, entry) {
  const relative = path.relative(root, entry);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function fileDigest(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
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
  if (!insideRoot(root, entry)) {
    const size = existsSync(entry) ? String(statSync(entry).size) : 'missing';
    return `${path.basename(entry)} ${size}`;
  }
  const name = posix(path.relative(root, entry));
  if (!existsSync(entry)) {
    return `${name} missing`;
  }
  return `${name} ${statSync(entry).isDirectory() ? directoryDigest(entry) : fileDigest(entry)}`;
}

function digests(root, entries) {
  return entries.map((entry) => entryDigest(root, entry)).sort();
}

export function lintFingerprint(plan) {
  const sources = plan.sources.filter((source) => insideRoot(plan.root, source));
  const inputs = {
    javac: javacVersion(plan.javac),
    level: languageLevel(plan.compiler),
    encoding: plan.compiler.encoding ?? 'UTF-8',
    args: lintCompatible(plan.compiler.args).map((arg) => arg.replaceAll(plan.root, '<root>')),
    classpath: digests(plan.root, plan.classpath),
    lombok: digests(plan.root, lombokPath(plan)),
    lombokConfigs: digests(plan.root, lombokConfigs({ root: plan.root, sources })),
    inheritedLombokConfig: createHash('sha256').update(rootLombokConfig(plan.root)).digest('hex'),
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

function dependentSources(classDirectory, { changed, unchanged }) {
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
  function inBaseline(file) {
    return path.join(baselineRoot, path.relative(plan.root, file));
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
