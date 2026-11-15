import { readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import {
  exportLine,
  fileAliasReads,
  fileDynamicImports,
  fileExports,
  fileImports,
  packageNameOf,
  referenceMembers,
  resolveModuleSpecifier,
} from './typed/module-views.mts';
import { codeExtensionNames } from '../../layout.mjs';
import { workspacePaths } from '../workspace/entries.mts';
import type { PackagesInfo } from '../workspace/workspace-types.mts';
import { moduleLinks } from './reexport-graph.mts';
import type { ResolvedModule } from './typed/graph-types.mts';

type SourceFile = TypeScript.SourceFile;
type Resolver = (specifier: string, containingFile: string) => string | undefined;
type Pending = { readonly specifier: string };

const ts = typescriptApi();
const CODE_FILE = new RegExp(`\\.(?:${codeExtensionNames.join('|')})$`, 'u');
const NO_LINKS: ResolvedModule = { edges: [], references: [] };

function workspaceSource(
  specifier: string,
  containingFile: string,
  paths: Readonly<Record<string, string[]>>,
): string | undefined {
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

function targetResolver({
  packagesInfo,
  layout,
}: {
  packagesInfo: PackagesInfo;
  layout: Parameters<typeof workspacePaths>[1];
}): Resolver {
  const paths = workspacePaths(packagesInfo.packages, layout);
  return function resolve(specifier: string, containingFile: string): string | undefined {
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

function resolveSources<T extends Pending>(
  items: readonly T[],
  file: string,
  resolve: Resolver,
): (T & { readonly source: string })[] {
  return items
    .map((item) => ({ ...item, source: resolve(item.specifier, file) }))
    .filter((item): item is T & { readonly source: string } => item.source !== undefined);
}

export function lazily<T>(compute: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= compute());
}

function isReadable(file: string): boolean {
  return CODE_FILE.test(file) && !file.endsWith('.d.ts');
}

function parse(file: string): SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

function readModule(file: string, resolve: Resolver): ResolvedModule {
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

export function projectModules(project: {
  packagesInfo: PackagesInfo;
  layout: Parameters<typeof workspacePaths>[1];
}): (file: string) => ResolvedModule {
  const resolve = targetResolver(project);
  const modules = new Map<string, ResolvedModule>();
  return function moduleOf(file: string): ResolvedModule {
    const known = modules.get(file) ?? readModule(path.normalize(file), resolve);
    modules.set(file, known);
    return known;
  };
}

export function exportLineOf(file: string, name: string): number | undefined {
  const normalized = path.normalize(file);
  return isReadable(normalized) ? exportLine(parse(normalized), name) : undefined;
}
