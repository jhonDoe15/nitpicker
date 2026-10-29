import { existsSync, readFileSync } from 'node:fs';

const MAIN_BRANCH = 'main';
const REPOSITORY_URL = /^(?:git\+)?(https:\/\/.*?)(?:\.git)?\/?$/u;
const PACKAGE_ROOT = new URL('../../', import.meta.url);

export function docsRef({ version, checkout }) {
  return checkout ? MAIN_BRANCH : `v${version}`;
}

function readManifest(packageRoot) {
  try {
    return { manifest: JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')) };
  } catch (error) {
    return { kind: 'unreadable-manifest', cause: error };
  }
}

export function docsRootUrl(packageRoot = PACKAGE_ROOT) {
  const { manifest } = readManifest(packageRoot);
  const repository = REPOSITORY_URL.exec(String(manifest?.repository?.url ?? ''))?.[1];
  const checkout = existsSync(new URL('.git', packageRoot));
  if (repository === undefined || (!checkout && typeof manifest.version !== 'string')) {
    return undefined;
  }
  return `${repository}/blob/${docsRef({ version: manifest.version, checkout })}`;
}

export function docsUrl(relativePath, anchor, root = docsRootUrl()) {
  if (root === undefined) {
    return undefined;
  }
  const url = `${root}/${relativePath}`;
  return anchor === undefined || anchor === '' ? url : `${url}#${anchor}`;
}
