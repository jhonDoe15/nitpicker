type Manifest = Record<string, unknown>;

const BUNDLE_KEYS = ['bundleDependencies', 'bundledDependencies'];

function isManifest(value: unknown): value is Manifest {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bundledList(value: unknown, manifest: Manifest): unknown[] {
  if (value !== true) {
    return [];
  }
  const dependencies = manifest['dependencies'];
  return isManifest(dependencies) ? Object.keys(dependencies) : [];
}

export function normalizedManifest(manifest: unknown): unknown {
  if (!isManifest(manifest)) {
    return manifest;
  }
  const changed = BUNDLE_KEYS.filter(
    (key) => key in manifest && !Array.isArray(manifest[key]) && manifest[key] !== undefined,
  );
  if (changed.length === 0) {
    return manifest;
  }
  const copy: Manifest = { ...manifest };
  for (const key of changed) {
    copy[key] = bundledList(manifest[key], manifest);
  }
  return copy;
}
