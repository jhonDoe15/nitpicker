import { existsSync, readFileSync } from 'node:fs';

const MAIN_BRANCH = 'main';
const REPOSITORY_URL = /^(?:git\+)?(.*?)(?:\.git)?$/u;
const PACKAGE_ROOT = new URL('../../', import.meta.url);

/**
 * The git ref the links of a copy of nitpicker point at: the release tag `v<version>` for an
 * installed package, which is always a released version, and `main` for a checkout of the
 * repository, whose code may be ahead of every tag.
 */
export function docsRef({ version, checkout }) {
  return checkout ? MAIN_BRANCH : `v${version}`;
}

/** The GitHub URL the documentation links start with, or undefined when package.json is missing. */
export function docsRootUrl() {
  const manifestUrl = new URL('package.json', PACKAGE_ROOT);
  if (!existsSync(manifestUrl)) {
    return undefined;
  }
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  const ref = docsRef({
    version: manifest.version,
    checkout: existsSync(new URL('.git', PACKAGE_ROOT)),
  });
  return `${REPOSITORY_URL.exec(manifest.repository.url)[1]}/blob/${ref}`;
}

/**
 * The GitHub URL of a file of this repository, with `anchor` as its fragment when given, or
 * undefined when `root` is. Pass `root` from one `docsRootUrl()` call to build many links.
 */
export function docsUrl(relativePath, anchor, root = docsRootUrl()) {
  if (root === undefined) {
    return undefined;
  }
  const url = `${root}/${relativePath}`;
  return anchor === undefined || anchor === '' ? url : `${url}#${anchor}`;
}
