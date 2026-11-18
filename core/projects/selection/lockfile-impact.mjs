import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../../diff/git/repository/command.mjs';
import { readPyproject, parseToml } from '../../configuration/project-checks/uv-workspace.mjs';
import { filesUnder } from '../../../shared/filesystem.mjs';
import { isPlainObject } from '../../../shared/config.mjs';
import { containedPath } from '../../../shared/paths/contained-path.mjs';
import { memoized } from '../../../shared/values/caching/memoized.mjs';
import { isInside } from '../discovery/repository-files.mjs';
import {
  changedPackages,
  closureOf,
  isLockfile,
  parseLockfile,
  pythonPackageName,
} from './dependencies/lockfiles.mjs';

const CATALOG = /(?:^|\/)gradle\/libs\.versions\.toml$/u;
const MANIFEST_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const GRADLE_BUILD = /\.gradle(?:\.kts)?$/u;
const SKIPPED_FOLDERS = new Set(['build', 'target', 'out', 'node_modules']);

function baseText(repositoryRoot, mergeBaseSha, file) {
  const listed = runGit(repositoryRoot, [
    'ls-tree',
    '--name-only',
    mergeBaseSha,
    '--',
    file,
  ]).trim();
  return listed === '' ? undefined : runGit(repositoryRoot, ['show', `${mergeBaseSha}:${file}`]);
}

function headText(repositoryRoot, file) {
  const full = containedPath(repositoryRoot, file, {
    outside: (relative) => `${relative} is outside the repository`,
  });
  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
}

function manifestNames(directory) {
  const file = path.join(directory, 'package.json');
  if (!existsSync(file)) {
    return undefined;
  }
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  return MANIFEST_FIELDS.flatMap((field) =>
    isPlainObject(manifest?.[field]) ? Object.keys(manifest[field]) : [],
  );
}

function directNeeds(project, lock) {
  if (project.preset === 'python') {
    const name = readPyproject(project.absolute)?.project?.name;
    return name === undefined ? undefined : [...(lock.edges.get(pythonPackageName(name)) ?? [])];
  }
  return manifestNames(project.absolute);
}

const SCRIPT_PRESETS = new Set(['typescript', 'javascript']);

function usesLockfile(file, project) {
  const fits =
    path.posix.basename(file) === 'uv.lock'
      ? project.preset === 'python'
      : SCRIPT_PRESETS.has(project.preset);
  return fits && isInside(project.repoPath ?? project.path, path.posix.dirname(file));
}

function changeReached(project, { head, changed }) {
  const direct = directNeeds(project, head);
  if (direct === undefined) {
    return { unknown: true };
  }
  return { hit: [...closureOf(head, direct)].find((name) => changed.has(name)) };
}

function lockImpact(file, texts, everyProject) {
  const projects = everyProject.filter((project) => usesLockfile(file, project));
  const [base, head] = texts.map((text) => parseLockfile(file, text).lock);
  if (base === undefined || head === undefined) {
    return undefined;
  }
  const changed = changedPackages(base, head);
  if (changed.size === 0) {
    return undefined;
  }
  const reached = projects.map((project) => [project, changeReached(project, { head, changed })]);
  if (reached.some(([, { unknown }]) => unknown === true)) {
    return undefined;
  }
  return new Map(
    reached.flatMap(([project, { hit }]) =>
      hit === undefined
        ? []
        : [[project.path, `${path.posix.basename(file)}: ${changed.get(hit)}`]],
    ),
  );
}

function accessors(prefix, table, valueOf) {
  return Object.entries(table ?? {}).map(([alias, entry]) => [
    `${prefix}.${alias.replaceAll(/[-_]/gu, '.')}`,
    JSON.stringify(valueOf(entry)),
  ]);
}

function catalogEntries(text) {
  const catalog = parseToml(text);
  const versions = catalog.versions ?? {};
  const libraries = catalog.libraries ?? {};
  function resolved(entry) {
    const ref = isPlainObject(entry) ? entry.version?.ref : undefined;
    return ref === undefined ? entry : { ...entry, version: versions[ref] };
  }
  function bundled(aliases) {
    return Array.isArray(aliases) ? aliases.map((alias) => resolved(libraries[alias])) : aliases;
  }
  return [
    ...accessors('libs', libraries, resolved),
    ...accessors('libs.plugins', catalog.plugins, resolved),
    ...accessors('libs.bundles', catalog.bundles, bundled),
    ...accessors('libs.versions', versions, (version) => version),
  ];
}

function buildText(directory) {
  const files = filesUnder(directory, {
    skipDirectory: (_absolute, entry) =>
      entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name),
  });
  return [...files]
    .filter((file) => GRADLE_BUILD.test(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

function catalogImpact(file, texts, projects) {
  const [base, head] = texts.map((text) => new Map(catalogEntries(text)));
  const changed = [...new Set([...base.keys(), ...head.keys()])].filter(
    (accessor) => base.get(accessor) !== head.get(accessor),
  );
  const impact = new Map();
  for (const project of projects) {
    const text = buildText(project.absolute);
    const hit = changed.find((accessor) =>
      new RegExp(`\\b${accessor.replaceAll('.', '\\.')}\\b`, 'u').test(text),
    );
    if (hit !== undefined) {
      impact.set(project.path, `${path.posix.basename(file)}: ${hit}`);
    }
  }
  return impact;
}

function weigh(file, texts, projects) {
  try {
    return {
      impact: CATALOG.test(file)
        ? catalogImpact(file, texts, projects)
        : lockImpact(file, texts, projects),
    };
  } catch (error) {
    return { impact: undefined, unreadable: error };
  }
}

function impactOf(file, { repositoryRoot, mergeBaseSha, projects }) {
  if (!(CATALOG.test(file) || isLockfile(file))) {
    return undefined;
  }
  const texts = [baseText(repositoryRoot, mergeBaseSha, file), headText(repositoryRoot, file)];
  return texts.includes(undefined) ? undefined : weigh(file, texts, projects).impact;
}

export function lockfileImpact(request) {
  return memoized((file) => impactOf(file, request));
}
