import { normalizedManifest } from './merge-manifests.mts';

type GetManifestModule = {
  readonly getManifest: (...parameters: unknown[]) => unknown;
  readonly clearCache: () => void;
};

const originalUrl = new URL(import.meta.url).searchParams.get('original');
if (originalUrl === null) {
  throw new Error('get-manifest replacement loaded without the original module');
}
const original = (await import(originalUrl)) as GetManifestModule;

export function getManifest(...parameters: unknown[]): unknown {
  return normalizedManifest(original.getManifest(...parameters));
}

export function clearCache(): void {
  original.clearCache();
}
