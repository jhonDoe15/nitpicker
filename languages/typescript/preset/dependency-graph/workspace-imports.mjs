import { existsSync } from 'node:fs';
import path from 'node:path';
import { specifiersOf, stringLeaves } from '../modules/production-imports.mjs';
import { readJsonc } from '../modules/tsconfig-files.mjs';
import { projectImports, projectSources } from './cruise.mjs';

const ENTRY_FIELDS = ['source', 'types', 'typings', 'module', 'main'];
const OUTPUT_FOLDER = /^(?:dist|build|lib|out)\/(?:(?:esm|cjs|es|types)\/)?/u;
const SOURCE_EXTENSIONS = new Map([
  ['.d.ts', ['.ts', '.tsx']],
  ['.d.mts', ['.mts']],
  ['.d.cts', ['.cts']],
  ['.js', ['.ts', '.tsx', '.js', '.jsx']],
  ['.jsx', ['.tsx', '.jsx']],
  ['.mjs', ['.mts', '.mjs']],
  ['.cjs', ['.cts', '.cjs']],
]);
const DECLARATION = /\.d\.[cm]?ts$/u;

function ancestors(file) {
  const parts = path.posix.dirname(file).split('/');
  const folders = parts.map((_, index) => parts.slice(0, parts.length - index).join('/'));
  return [...folders.filter((folder) => folder !== '.'), '.'];
}

function workspacePackages(projectRoot, sources) {
  const folders = new Set(sources.flatMap(ancestors));
  const packages = new Map();
  for (const folder of folders) {
    const manifest = path.join(projectRoot, folder, 'package.json');
    const fields = existsSync(manifest) ? readJsonc(manifest) : undefined;
    if (typeof fields?.name === 'string' && !packages.has(fields.name)) {
      packages.set(fields.name, { folder, fields });
    }
  }
  return packages;
}

function packageNameOf(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.includes(':')) {
    return undefined;
  }
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function entryTargets(fields, subpath) {
  const exported = fields.exports;
  if (subpath.length > 0) {
    const key = `./${subpath}`;
    const named = exported !== null && typeof exported === 'object' ? exported[key] : undefined;
    return [...stringLeaves(named), subpath];
  }
  const root =
    typeof exported === 'string' || Array.isArray(exported) || exported?.['.'] === undefined
      ? exported
      : exported['.'];
  const hasSubpaths =
    root !== null && typeof root === 'object' && !Array.isArray(root)
      ? Object.keys(root).some((key) => key.startsWith('./'))
      : false;
  return [
    ...(hasSubpaths ? [] : stringLeaves(root)),
    ...ENTRY_FIELDS.map((field) => fields[field]),
    'index.js',
  ].filter((target) => typeof target === 'string');
}

function withSourceExtensions(file) {
  const extension = [...SOURCE_EXTENSIONS.keys()].find((ending) => file.endsWith(ending));
  if (extension === undefined) {
    return [file, ...['.ts', '.tsx'].map((ending) => `${file}${ending}`)];
  }
  const stem = file.slice(0, -extension.length);
  return [
    ...(DECLARATION.test(file) ? [] : [file]),
    ...SOURCE_EXTENSIONS.get(extension).map((ending) => `${stem}${ending}`),
  ];
}

function sourceCandidates(target) {
  const relative = path.posix.normalize(target).replace(/^\.\//u, '');
  const unbuilt = relative.replace(OUTPUT_FOLDER, '');
  const bases = [relative, ...(unbuilt === relative ? [] : [`src/${unbuilt}`, unbuilt])];
  return bases.flatMap(withSourceExtensions);
}

function workspaceTarget(entry, subpath, isSource) {
  for (const target of entryTargets(entry.fields, subpath)) {
    const found = sourceCandidates(target)
      .map((candidate) => path.posix.normalize(path.posix.join(entry.folder, candidate)))
      .find(isSource);
    if (found !== undefined) {
      return { to: found };
    }
  }
  return { package: entry.folder };
}

function workspaceImports(projectRoot, sources) {
  const sourceSet = new Set(sources);
  function isSource(file) {
    return sourceSet.has(file);
  }
  const packages = workspacePackages(projectRoot, sources);
  if (packages.size === 0) {
    return [];
  }
  return sources.flatMap((from) =>
    specifiersOf(path.join(projectRoot, from)).flatMap((specifier) => {
      const name = packageNameOf(specifier);
      const entry = name === undefined ? undefined : packages.get(name);
      return entry === undefined
        ? []
        : [{ from, ...workspaceTarget(entry, specifier.slice(name.length + 1), isSource) }];
    }),
  );
}

export function graphImports(graph, { isSourceFile, projectRoot }) {
  return [
    ...projectImports(graph, isSourceFile),
    ...workspaceImports(projectRoot, projectSources(graph, isSourceFile)),
  ];
}
