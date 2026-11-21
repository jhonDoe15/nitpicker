import path from 'node:path';
import { readBoundedText } from '../../filesystem.mts';
import { appendAll } from '../../lists/lists.mts';
import { parseWithModule } from '../../values/parse-module.mts';
import { fieldsOf, hasField, isText, listOf } from '../../values/readers.mts';

export type TomlTable = {
  readonly [key: string]: unknown;
  readonly bin?: unknown;
  readonly build?: unknown;
  readonly default?: unknown;
  readonly dependencies?: unknown;
  readonly exclude?: unknown;
  readonly features?: unknown;
  readonly members?: unknown;
  readonly name?: unknown;
  readonly optional?: unknown;
  readonly package?: unknown;
  readonly path?: unknown;
  readonly target?: unknown;
  readonly workspace?: unknown;
};

export type ManifestEntry = {
  readonly file: string;
  readonly folder: string;
  readonly manifest: TomlTable;
};

export type CargoCrate = {
  readonly manifest: string;
  readonly folder: string;
  readonly name: string;
  readonly roots: readonly string[];
  readonly threadPool: boolean;
  readonly allocatorCrate: boolean;
  readonly pathDependencies: readonly string[];
};

type Workspace = ManifestEntry | undefined;
type DependencyEntry = readonly [string, { readonly raw: unknown; readonly workspace: Workspace }];
type ResolvedSpec = TomlTable & { readonly crate: string; readonly base: string | undefined };
type TomlResult =
  { readonly kind: 'parsed'; readonly value: unknown } | { readonly kind: 'malformed-toml' };

const MAX_TEXT_BYTES = 1024 * 1024;
const THREAD_POOL_CRATES = new Set(['rayon', 'threadpool']);
const MULTI_THREAD_FEATURES = new Set(['rt-multi-thread', 'full']);
const ALLOCATOR_FEATURES = new Map([
  ['mimalloc', 'override'],
  ['tikv-jemallocator', 'unprefixed_malloc_on_supported_platforms'],
  ['jemallocator', 'unprefixed_malloc_on_supported_platforms'],
]);
const LINUX_TARGET = /linux|unix|musl/u;
const EXCLUDING_TARGET = /\bnot\s*\(|windows|macos|ios|android|wasm|gnu"/u;

export function readSmallText(projectRoot: string, file: string): string | undefined {
  return readBoundedText(projectRoot, file, MAX_TEXT_BYTES);
}

function tomlResult(text: string): TomlResult {
  try {
    return { kind: 'parsed', value: parseWithModule('smol-toml', text) };
  } catch {
    return { kind: 'malformed-toml' };
  }
}

export function parsedToml(projectRoot: string, file: string): TomlTable | undefined {
  const text = readSmallText(projectRoot, file);
  const result = text === undefined ? undefined : tomlResult(text);
  return result?.kind === 'parsed' ? fieldsOf(result.value) : undefined;
}

export function tableOf(value: unknown): TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? fieldsOf(value)
    : {};
}

function stringItems(value: unknown): string[] {
  return listOf(value).filter(isText);
}

export function reachable<Item>(
  starts: readonly Item[],
  next: (item: Item) => readonly Item[],
): Item[] {
  const seen = new Set(starts);
  const pending = [...starts];
  for (const item of pending) {
    const fresh = new Set(next(item).filter((child) => !seen.has(child)));
    for (const child of fresh) {
      seen.add(child);
    }
    appendAll(pending, [...fresh]);
  }
  return pending;
}

function defaultFeatureNames(manifest: TomlTable): Set<string> {
  const features = tableOf(manifest.features);
  return new Set(
    reachable(stringItems(features.default), (feature) => stringItems(features[feature])),
  );
}

function isBuiltForLinux(key: string): boolean {
  return LINUX_TARGET.test(key) && !EXCLUDING_TARGET.test(key);
}

function crateDependencies(manifest: TomlTable): [string, unknown][] {
  const targets = Object.entries(tableOf(manifest.target))
    .filter(([key]) => isBuiltForLinux(key))
    .map(([, target]) => tableOf(tableOf(target).dependencies));
  const enabled = defaultFeatureNames(manifest);
  return [tableOf(manifest.dependencies), ...targets]
    .flatMap((table) => Object.entries(table))
    .filter(
      ([name, spec]) =>
        tableOf(spec).optional !== true || enabled.has(name) || enabled.has(`dep:${name}`),
    );
}

function resolvedSpec(name: string, spec: unknown, workspace: Workspace): ResolvedSpec {
  const own = tableOf(spec);
  if (own.workspace !== true || workspace === undefined) {
    return { ...own, crate: typeof own.package === 'string' ? own.package : name, base: undefined };
  }
  const inherited = tableOf(tableOf(tableOf(workspace.manifest.workspace).dependencies)[name]);
  return {
    ...inherited,
    features: [...stringItems(inherited.features), ...stringItems(own.features)],
    crate: typeof inherited.package === 'string' ? inherited.package : name,
    base: workspace.folder,
  };
}

function hasFeature(spec: ResolvedSpec, feature: string | undefined): boolean {
  return feature !== undefined && stringItems(spec.features).includes(feature);
}

function crateFacts(
  folder: string,
  dependencies: readonly DependencyEntry[],
): Pick<CargoCrate, 'threadPool' | 'allocatorCrate' | 'pathDependencies'> {
  const specs = dependencies.map(([name, spec]) => resolvedSpec(name, spec.raw, spec.workspace));
  return {
    threadPool: specs.some(
      (spec) =>
        THREAD_POOL_CRATES.has(spec.crate) ||
        (spec.crate === 'tokio' &&
          stringItems(spec.features).some((feature) => MULTI_THREAD_FEATURES.has(feature))),
    ),
    allocatorCrate: specs.some(
      (spec) =>
        ALLOCATOR_FEATURES.has(spec.crate) && hasFeature(spec, ALLOCATOR_FEATURES.get(spec.crate)),
    ),
    pathDependencies: specs.flatMap((spec) =>
      typeof spec.path === 'string'
        ? [path.posix.normalize(path.posix.join(spec.base ?? folder, spec.path))]
        : [],
    ),
  };
}

function rootFilesOf(folder: string, manifest: TomlTable, fileSet: ReadonlySet<string>): string[] {
  const prefix = folder === '.' ? '' : `${folder}/`;
  const declared = listOf(manifest.bin)
    .map((binary) => tableOf(binary).path)
    .filter(isText)
    .map((file) => path.posix.normalize(path.posix.join(folder, file.replaceAll('\\', '/'))));
  return [...new Set([...declared, `${prefix}src/main.rs`])].filter((file) => fileSet.has(file));
}

function binFilesByCrate(files: readonly string[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of files) {
    const parts = file.split('/');
    const index = parts.lastIndexOf('bin');
    const rest = index === -1 ? [] : parts.slice(index + 1);
    const isBin =
      index >= 1 &&
      parts[index - 1] === 'src' &&
      file.endsWith('.rs') &&
      (rest.length === 1 || (rest.length === 2 && rest[1] === 'main.rs'));
    if (isBin) {
      const folder = index === 1 ? '.' : parts.slice(0, index - 1).join('/');
      const list = found.get(folder) ?? [];
      list.push(file);
      found.set(folder, list);
    }
  }
  return found;
}

function enclosingWorkspace(
  folder: string,
  workspaces: readonly ManifestEntry[],
): ManifestEntry | undefined {
  return workspaces
    .filter(
      ({ folder: owner }) => owner === '.' || folder === owner || folder.startsWith(`${owner}/`),
    )
    .reduce<ManifestEntry | undefined>(
      (best, candidate) =>
        best === undefined || candidate.folder.length > best.folder.length ? candidate : best,
      undefined,
    );
}

export function cargoManifests(projectRoot: string, files: readonly string[]): ManifestEntry[] {
  return files
    .filter((file) => path.posix.basename(file) === 'Cargo.toml')
    .flatMap((file) => {
      const manifest = parsedToml(projectRoot, file);
      return manifest === undefined ? [] : [{ file, folder: path.posix.dirname(file), manifest }];
    });
}

export function cargoCrates(
  manifests: readonly ManifestEntry[],
  files: readonly string[],
): CargoCrate[] {
  const fileSet = new Set(files);
  const bins = binFilesByCrate(files);
  const workspaces = manifests.filter(({ manifest }) => hasField(manifest, 'workspace'));
  return manifests
    .filter(({ manifest }) => hasField(tableOf(manifest.package), 'name'))
    .map(({ file, folder, manifest }) => {
      const workspace = enclosingWorkspace(folder, workspaces);
      const dependencies = crateDependencies(manifest).map(([name, raw]): DependencyEntry => [
        name,
        { raw, workspace },
      ]);
      return {
        manifest: file,
        folder,
        name: String(tableOf(manifest.package).name),
        roots: [...rootFilesOf(folder, manifest, fileSet), ...(bins.get(folder) ?? [])],
        ...crateFacts(folder, dependencies),
      };
    });
}

export function sourcesByCrate(
  crates: readonly CargoCrate[],
  files: readonly string[],
): Map<string, string[]> {
  const sources = new Map<string, string[]>(crates.map((crate) => [crate.folder, []]));
  for (const file of files) {
    if (!file.endsWith('.rs')) {
      continue;
    }
    const parts = file.split('/');
    const sourceIndex = parts.lastIndexOf('src');
    const folder = sourceIndex <= 0 ? '.' : parts.slice(0, sourceIndex).join('/');
    const owned = sources.get(folder);
    if (sourceIndex !== -1 && owned !== undefined) {
      owned.push(file);
    }
  }
  return sources;
}
