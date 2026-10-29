import { existsSync, readFileSync } from 'node:fs';

const MAIN_BRANCH = 'main';
const REPOSITORY_URL = /^(?:git\+)?(.*?)(?:\.git)?$/u;
const PACKAGE_ROOT = new URL('../../', import.meta.url);
const ROOT_URLS = new Map();

/**
 * The git ref the links of a copy of nitpicker point at: the release tag `v<version>` for an
 * installed package, which is always a released version, and `main` for a checkout of the
 * repository, whose code may be ahead of every tag.
 */
export function docsRef({ version, checkout }) {
  return checkout ? MAIN_BRANCH : `v${version}`;
}

function readDocsRootUrl() {
  const manifest = JSON.parse(readFileSync(new URL('package.json', PACKAGE_ROOT), 'utf8'));
  const ref = docsRef({
    version: manifest.version,
    checkout: existsSync(new URL('.git', PACKAGE_ROOT)),
  });
  return `${REPOSITORY_URL.exec(manifest.repository.url)[1]}/blob/${ref}`;
}

function docsRootUrl() {
  if (!ROOT_URLS.has(PACKAGE_ROOT.href)) {
    ROOT_URLS.set(PACKAGE_ROOT.href, readDocsRootUrl());
  }
  return ROOT_URLS.get(PACKAGE_ROOT.href);
}

/** The GitHub URL of a file of this repository, with `anchor` as its fragment when given. */
export function docsUrl(relativePath, anchor) {
  const url = `${docsRootUrl()}/${relativePath}`;
  return anchor === undefined || anchor === '' ? url : `${url}#${anchor}`;
}
