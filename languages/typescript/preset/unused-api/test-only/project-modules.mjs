import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { packageNameOf, resolveModuleSpecifier } from '../../modules/module-resolution.mjs';
import {
  exportLine,
  fileAliasReads,
  fileDynamicImports,
  fileExports,
  fileImports,
} from '../../syntax/module-facts.mjs';
import { referenceMembers } from '../../syntax/references.mjs';
import { codeExtensionNames } from '../../layout.mjs';
import { workspacePaths } from '../workspace/entries.mjs';
import { moduleLinks } from './reexport-graph.mjs';

const CODE_FILE = new RegExp(`\\.(?:${codeExtensionNames.join('|')})$`, 'u');
const NO_LINKS = { edges: [], references: [] };

function workspaceSource(specifier, containingFile, paths) {
  const exact = paths[specifier]?.[0];
  const name = packageNameOf(specifier);
  const patterns = paths[`${name}/*`] ?? [];
  const subpath = specifier.slice(name.length + 1);
  const candidates = patterns.map((pattern) => pattern.replace('*', subpath));
  return (
    exact ??
    candidates
      .map((candidate) => resolveModuleSpecifier(candidate, containingFile))
      .find(({ kind }) => kind === 'file')?.path
  );
}

function targetResolver({ packagesInfo, layout }) {
  const paths = workspacePaths(packagesInfo.packages, layout);
  return function resolve(specifier, containingFile) {
    const resolved = resolveModuleSpecifier(specifier, containingFile);
    if (resolved.kind === 'file') {
      return resolved.path;
    }
    if (resolved.kind !== 'package') {
      return undefined;
    }
    return resolved.path ?? workspaceSource(specifier, containingFile, paths);
  };
}

function resolveSources(items, file, resolve) {
  return items
    .map((item) => ({ ...item, source: resolve(item.specifier, file) }))
    .filter(({ source }) => source !== undefined);
}

export function lazily(compute) {
  let value;
  return () => (value ??= compute());
}

function isReadable(file) {
  return CODE_FILE.test(file) && !file.endsWith('.d.ts');
}

function parse(file) {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

function readModule(file, resolve) {
  if (!isReadable(file)) {
    return NO_LINKS;
  }
  const sourceFile = parse(file);
  const members = referenceMembers([sourceFile], fileAliasReads(sourceFile));
  const links = moduleLinks({
    imports: fileImports(sourceFile),
    dynamicImports: fileDynamicImports(sourceFile),
    exports: fileExports(sourceFile),
    referenced: new Set(members.keys()),
    members,
  });
  const references = lazily(() => resolveSources(links.references, file, resolve));
  return {
    edges: resolveSources(links.edges, file, resolve),
    get references() {
      return references();
    },
  };
}

export function projectModules(project) {
  const resolve = targetResolver(project);
  const modules = new Map();
  return function moduleOf(file) {
    if (!modules.has(file)) {
      modules.set(file, readModule(path.normalize(file), resolve));
    }
    return modules.get(file);
  };
}

export function exportLineOf(file, name) {
  const normalized = path.normalize(file);
  return isReadable(normalized) ? exportLine(parse(normalized), name) : undefined;
}
