import { createRequire } from 'node:module';
import path from 'node:path';
import { hasJavaScriptApi, redirectTypeScriptApi } from './api-redirect.mjs';

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

export function selectTypeScriptApi(resolve = createRequire(import.meta.url).resolve) {
  const resolved = resolvedTypeScript(resolve);
  return resolved !== undefined && hasJavaScriptApi(resolved)
    ? { file: resolved, bundled: false }
    : { file: resolve('typescript-js-api'), bundled: true };
}

export const TYPESCRIPT_API = selectTypeScriptApi();

export function redirectToBundledTypeScriptApi(environment, selected = TYPESCRIPT_API) {
  if (selected.bundled) {
    redirectTypeScriptApi(path.dirname(path.dirname(selected.file)), environment);
  }
}
