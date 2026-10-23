import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../../../../core/diff/git/repository/command.mjs';
import { diffFromBase } from '../../../../core/tooling/git/base-diff.mjs';
import { collectImports, importEdges } from '../analysis/python-coupling.mjs';
import { testFileMatcher } from '../analysis/python-sources.mjs';
import { META_SUFFIX, MUTANTS_DIRECTORY, metaFiles } from './python-mutation-data.mjs';
import { run } from '../execution/python-process.mjs';

const REUSABLE_STATUSES = ['M', 'A'];

function parseNameStatus(listing) {
  const fields = listing.split('\0').filter((field) => field !== '');
  return fields.flatMap((field, index) =>
    index % 2 === 0 ? [{ status: field, file: fields[index + 1] }] : [],
  );
}

function gitListing({ baselineRoot, projectRoot }) {
  try {
    return {
      listing: diffFromBase({
        runGit,
        baselineRoot,
        projectRoot,
        args: ['--name-status', '--no-renames', '-z'],
        pathspec: ['--', ':/'],
      }),
      prefix: runGit(projectRoot, ['rev-parse', '--show-prefix']).trim(),
    };
  } catch (error) {
    return { error };
  }
}

function changesSinceBase(roots) {
  const { listing, prefix, error } = gitListing(roots);
  return error === undefined
    ? parseNameStatus(listing).map((change) => ({ ...change, prefix }))
    : undefined;
}

function isMutatedSourceChange({ status, file, prefix }, { sourceRoots, isTest }) {
  if (!REUSABLE_STATUSES.includes(status) || !file.startsWith(prefix)) {
    return false;
  }
  const relative = file.slice(prefix.length);
  return (
    relative.endsWith('.py') &&
    !isTest(relative) &&
    sourceRoots.some((root) => root === '.' || relative.startsWith(`${root}/`))
  );
}

function importersOf(changedFiles, { modules, imports }) {
  const moduleOfFile = new Map(modules.map(({ file, module }) => [file, module]));
  const fileOfModule = new Map(modules.map(({ file, module }) => [module, file]));
  const importers = new Map();
  for (const { source, target } of importEdges(modules, imports)) {
    importers.set(target, [...(importers.get(target) ?? []), source]);
  }
  const affected = new Set(changedFiles.map((file) => moduleOfFile.get(file)));
  for (const module of affected) {
    for (const importer of importers.get(module) ?? []) {
      affected.add(importer);
    }
  }
  return new Set([...affected].map((module) => fileOfModule.get(module)));
}

function scanOutcome(context) {
  try {
    return { kind: 'scanned', ...collectImports(context, run) };
  } catch (error) {
    return { kind: 'unreadable', error };
  }
}

function isStaleSource(context, changes) {
  if (changes.length === 0) {
    return () => false;
  }
  const scanned = scanOutcome(context);
  if (scanned.kind === 'unreadable') {
    return undefined;
  }
  const known = new Set(scanned.modules.map(({ file }) => file));
  const changed = changes.map(({ file, prefix }) => file.slice(prefix.length));
  if (!changed.every((file) => known.has(file))) {
    return undefined;
  }
  const affected = importersOf(changed, scanned);
  return (file) => !known.has(file) || affected.has(file);
}

function reusableChanges({ baselineRoot, projectRoot, project }, baseMutants) {
  if (!existsSync(baseMutants)) {
    return undefined;
  }
  const changes = changesSinceBase({ baselineRoot, projectRoot });
  const isTest = testFileMatcher(projectRoot);
  const reusable = changes?.every((change) =>
    isMutatedSourceChange(change, { sourceRoots: project.sourceRoots, isTest }),
  );
  return reusable === true ? changes : undefined;
}

export function seedMutantsFromBase(context) {
  const { snapshot, baselineRoot, projectRoot } = context;
  if (snapshot !== 'head' || baselineRoot === undefined) {
    return false;
  }
  const baseMutants = path.join(baselineRoot, MUTANTS_DIRECTORY);
  const changes = reusableChanges(context, baseMutants);
  if (changes === undefined) {
    return false;
  }
  const isStale = isStaleSource(context, changes);
  if (isStale === undefined) {
    return false;
  }
  for (const file of metaFiles(baseMutants).filter((candidate) => !isStale(candidate))) {
    const target = path.join(projectRoot, MUTANTS_DIRECTORY, `${file}${META_SUFFIX}`);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(baseMutants, `${file}${META_SUFFIX}`), target);
  }
  return true;
}
