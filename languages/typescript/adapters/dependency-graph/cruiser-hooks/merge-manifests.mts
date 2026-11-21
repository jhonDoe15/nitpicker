type Manifest = Record<string, unknown>;
type Merge = (closest: unknown, further: unknown) => unknown;

const BUNDLE_KEYS = ['bundleDependencies', 'bundledDependencies'];

const originalUrl = new URL(import.meta.url).searchParams.get('original');
const original =
  originalUrl === null ? undefined : ((await import(originalUrl)) as { default: Merge }).default;

function isManifest(value: unknown): value is Manifest {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bundledList(value: unknown, manifest: Manifest): unknown[] {
  if (value !== true) return [];
  const dependencies = manifest['dependencies'];
  return isManifest(dependencies) ? Object.keys(dependencies) : [];
}

export function normalizedManifest<T>(manifest: T): T {
  if (!isManifest(manifest)) return manifest;
  const changed = BUNDLE_KEYS.filter(
    (key) => key in manifest && !Array.isArray(manifest[key]) && manifest[key] !== undefined,
  );
  if (changed.length === 0) return manifest;
  const copy: Manifest = { ...manifest };
  for (const key of changed) copy[key] = bundledList(manifest[key], manifest);
  return copy as T;
}

export default function mergeManifests(closest: unknown, further: unknown): unknown {
  if (original === undefined) {
    throw new Error('merge-manifests replacement loaded without the original module');
  }
  return original(normalizedManifest(closest), normalizedManifest(further));
}
