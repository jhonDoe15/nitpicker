import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathInside } from '../../filesystem.mjs';
import { appendAll } from '../../lists/items.mjs';

const requireModule = createRequire(import.meta.url);
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

export function readSmallText(projectRoot, file) {
  const full = pathInside(projectRoot, file);
  const stats = full === undefined ? undefined : lstatSync(full, { throwIfNoEntry: false });
  return stats?.isFile() === true && stats.size <= MAX_TEXT_BYTES
    ? readFileSync(full, 'utf8')
    : undefined;
}

function tomlResult(text) {
  try {
    return { kind: 'parsed', value: requireModule('smol-toml').parse(text) };
  } catch {
    return { kind: 'malformed-toml' };
  }
}

export function parsedToml(projectRoot, file) {
  const text = readSmallText(projectRoot, file);
  const result = text === undefined ? undefined : tomlResult(text);
  return result?.kind === 'parsed' ? result.value : undefined;
}

export function tableOf(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function listOf(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

export function reachable(starts, next) {
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

function defaultFeatureNames(manifest) {
  const features = tableOf(manifest.features);
  return new Set(reachable(listOf(features.default), (feature) => listOf(features[feature])));
}

function isBuiltForLinux(key) {
  return LINUX_TARGET.test(key) && !EXCLUDING_TARGET.test(key);
}

function crateDependencies(manifest) {
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

function resolvedSpec(name, spec, workspace) {
  const own = tableOf(spec);
  if (own.workspace !== true || workspace === undefined) {
    return { ...own, crate: typeof own.package === 'string' ? own.package : name, base: undefined };
  }
  const inherited = tableOf(tableOf(workspace.manifest.workspace.dependencies)[name]);
  return {
    ...inherited,
    features: [...listOf(inherited.features), ...listOf(own.features)],
    crate: typeof inherited.package === 'string' ? inherited.package : name,
    base: workspace.folder,
  };
}

function hasFeature(spec, feature) {
  return listOf(spec.features).includes(feature);
}

function crateFacts(folder, dependencies) {
  const specs = dependencies.map(([name, spec]) => resolvedSpec(name, spec.raw, spec.workspace));
  return {
    threadPool: specs.some(
      (spec) =>
        THREAD_POOL_CRATES.has(spec.crate) ||
        (spec.crate === 'tokio' &&
          listOf(spec.features).some((feature) => MULTI_THREAD_FEATURES.has(feature))),
    ),
    allocatorCrate: specs.some(
      (spec) =>
        ALLOCATOR_FEATURES.has(spec.crate) && hasFeature(spec, ALLOCATOR_FEATURES.get(spec.crate)),
    ),
    pathDependencies: specs
      .filter((spec) => typeof spec.path === 'string')
      .map((spec) => path.posix.normalize(path.posix.join(spec.base ?? folder, spec.path))),
  };
}

function rootFilesOf(folder, manifest, fileSet) {
  const prefix = folder === '.' ? '' : `${folder}/`;
  const declared = (Array.isArray(manifest.bin) ? manifest.bin : [])
    .map((binary) => tableOf(binary).path)
    .filter((file) => typeof file === 'string')
    .map((file) => path.posix.normalize(path.posix.join(folder, file.replaceAll('\\', '/'))));
  return [...new Set([...declared, `${prefix}src/main.rs`])].filter((file) => fileSet.has(file));
}

function binFilesByCrate(files) {
  const found = new Map();
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

function enclosingWorkspace(folder, workspaces) {
  return workspaces
    .filter(
      ({ folder: owner }) => owner === '.' || folder === owner || folder.startsWith(`${owner}/`),
    )
    .reduce(
      (best, candidate) =>
        best === undefined || candidate.folder.length > best.folder.length ? candidate : best,
      undefined,
    );
}

export function cargoManifests(projectRoot, files) {
  return files
    .filter((file) => path.posix.basename(file) === 'Cargo.toml')
    .map((file) => ({
      file,
      folder: path.posix.dirname(file),
      manifest: parsedToml(projectRoot, file),
    }))
    .filter(({ manifest }) => manifest !== undefined);
}

export function cargoCrates(manifests, files) {
  const fileSet = new Set(files);
  const bins = binFilesByCrate(files);
  const workspaces = manifests.filter(({ manifest }) => manifest.workspace !== undefined);
  return manifests
    .filter(({ manifest }) => tableOf(manifest.package).name !== undefined)
    .map(({ file, folder, manifest }) => {
      const workspace = enclosingWorkspace(folder, workspaces);
      const dependencies = crateDependencies(manifest).map(([name, raw]) => [
        name,
        { raw, workspace },
      ]);
      return {
        manifest: file,
        folder,
        name: String(manifest.package.name),
        roots: [...rootFilesOf(folder, manifest, fileSet), ...(bins.get(folder) ?? [])],
        ...crateFacts(folder, dependencies),
      };
    });
}

export function sourcesByCrate(crates, files) {
  const owners = new Map(crates.map((crate) => [crate.folder, crate]));
  const sources = new Map(crates.map((crate) => [crate.folder, []]));
  for (const file of files) {
    if (!file.endsWith('.rs')) {
      continue;
    }
    const parts = file.split('/');
    const sourceIndex = parts.lastIndexOf('src');
    const folder = sourceIndex <= 0 ? '.' : parts.slice(0, sourceIndex).join('/');
    if (sourceIndex !== -1 && owners.has(folder)) {
      sources.get(folder).push(file);
    }
  }
  return sources;
}
