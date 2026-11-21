import { existsSync, readFileSync } from 'node:fs';
import { fieldOf, textOf } from '../values/readers.mts';

const MAIN_BRANCH = 'main';
const RULE_PAGES = 'docs/rules/';
export const LATEST_RELEASE_TAG = 'latest';
const REPOSITORY_URL = /^(?:git\+)?(https:\/\/.*?)(?:\.git)?\/?$/u;
const PACKAGE_ROOT = new URL('../../', import.meta.url);

export function docsRef({ version, checkout }: { version: string; checkout: boolean }): string {
  return checkout ? MAIN_BRANCH : `v${version}`;
}

function readManifest(packageRoot: URL): { manifest: unknown } | { kind: string; cause: unknown } {
  try {
    return { manifest: JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')) };
  } catch (error) {
    return { kind: 'unreadable-manifest', cause: error };
  }
}

export function docsRootUrl(packageRoot: URL = PACKAGE_ROOT): string | undefined {
  const read = readManifest(packageRoot);
  const manifest = 'manifest' in read ? read.manifest : undefined;
  const url = fieldOf(fieldOf(manifest, 'repository'), 'url');
  const repository = REPOSITORY_URL.exec(url === undefined || url === null ? '' : textOf(url))?.[1];
  const checkout = existsSync(new URL('.git', packageRoot));
  const version = fieldOf(manifest, 'version');
  if (repository === undefined || (!checkout && typeof version !== 'string')) {
    return undefined;
  }
  return `${repository}/blob/${docsRef({ version: String(version), checkout })}`;
}

function rootWithRulePagesAtLatestRelease(relativePath: string, root: string): string {
  return relativePath.startsWith(RULE_PAGES)
    ? root.replace(/\/blob\/main$/u, () => `/blob/${LATEST_RELEASE_TAG}`)
    : root;
}

export function docsUrl(
  relativePath: string,
  anchor?: string,
  root: string | undefined = docsRootUrl(),
): string | undefined {
  if (root === undefined) {
    return undefined;
  }
  const url = `${rootWithRulePagesAtLatestRelease(relativePath, root)}/${relativePath}`;
  return anchor === undefined || anchor === '' ? url : `${url}#${anchor}`;
}
