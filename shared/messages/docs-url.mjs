import { readFileSync } from 'node:fs';

const DOCS_BRANCH = 'main';
const REPOSITORY_URL = /^(?:git\+)?(.*?)(?:\.git)?$/u;

function docsRootUrl() {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  return `${REPOSITORY_URL.exec(manifest.repository.url)[1]}/blob/${DOCS_BRANCH}`;
}

/** The GitHub URL of a file of this repository, with `anchor` as its fragment when given. */
export function docsUrl(relativePath, anchor) {
  const url = `${docsRootUrl()}/${relativePath}`;
  return anchor === undefined || anchor === '' ? url : `${url}#${anchor}`;
}
