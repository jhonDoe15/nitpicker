import { createRequire, findPackageJSON } from 'node:module';
import path from 'node:path';
import {
  hasJavaScriptApi,
  packageHasJavaScriptApi,
  redirectTypeScriptApi,
} from './api-redirect.mjs';

function resolvedTypeScript(resolve) {
  try {
    return resolve('typescript');
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
}

function installedTypeScriptRoot() {
  try {
    const packageFile = findPackageJSON('typescript', import.meta.url);
    return packageFile === undefined ? undefined : path.dirname(packageFile);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
}

export function selectTypeScriptApi(
  resolve = createRequire(import.meta.url).resolve,
  installedRoot = installedTypeScriptRoot(),
) {
  const resolved = resolvedTypeScript(resolve);
  return resolved !== undefined &&
    hasJavaScriptApi(resolved) &&
    installedRoot !== undefined &&
    packageHasJavaScriptApi(installedRoot)
    ? { file: resolved, bundled: false }
    : { file: resolve('typescript-js-api'), bundled: true };
}

export function redirectToBundledTypeScriptApi(environment, selected = selectTypeScriptApi()) {
  if (selected.bundled) {
    redirectTypeScriptApi(path.dirname(path.dirname(selected.file)), environment);
  }
}
