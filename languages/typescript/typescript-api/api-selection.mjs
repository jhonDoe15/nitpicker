import { createRequire } from 'node:module';
import path from 'node:path';
import { hasJavaScriptApi, redirectTypeScriptApi } from './api-redirect.mjs';

function resolvedOrUndefined(resolve, name) {
  try {
    return resolve(name);
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
}

export function selectTypeScriptApi(resolve = createRequire(import.meta.url).resolve) {
  const resolved = resolvedOrUndefined(resolve, 'typescript');
  const bundled = resolvedOrUndefined(resolve, 'typescript-js-api');
  return resolved !== undefined && resolved !== bundled && hasJavaScriptApi(resolved)
    ? { file: resolved, bundled: false }
    : { file: bundled ?? resolve('typescript-js-api'), bundled: true };
}

export function redirectToBundledTypeScriptApi(environment, selected = selectTypeScriptApi()) {
  if (selected.bundled) {
    redirectTypeScriptApi(path.dirname(path.dirname(selected.file)), environment);
  }
}
