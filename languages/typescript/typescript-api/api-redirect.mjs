import { existsSync } from 'node:fs';
import nodeModule from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API_SPECIFIERS = new Set(['typescript', 'typescript/lib/typescript.js']);
const UNRESOLVED_CODES = new Set([
  'ERR_MODULE_NOT_FOUND',
  'MODULE_NOT_FOUND',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
]);

export function hasJavaScriptApi(resolvedFile) {
  return existsSync(path.join(path.dirname(resolvedFile), 'typescript.js'));
}

function resolvedOrUndefined(nextResolve, specifier, context) {
  try {
    return nextResolve(specifier, context);
  } catch (error) {
    if (UNRESOLVED_CODES.has(error?.code)) {
      return undefined;
    }
    throw error;
  }
}

export function apiResolution(apiUrl) {
  return (specifier, context, nextResolve) => {
    if (!API_SPECIFIERS.has(specifier)) {
      return nextResolve(specifier, context);
    }
    const resolved = resolvedOrUndefined(nextResolve, specifier, context);
    return resolved?.url.startsWith('file:') === true &&
      hasJavaScriptApi(fileURLToPath(resolved.url))
      ? resolved
      : { url: apiUrl, format: 'commonjs', shortCircuit: true };
  };
}

function redirectPreload(apiFile) {
  const source =
    `import { redirectTypeScriptApi } from ${JSON.stringify(import.meta.url)};` +
    `redirectTypeScriptApi(${JSON.stringify(apiFile)}, process.env);`;
  return `--import=data:text/javascript,${encodeURIComponent(source)}`;
}

export function withRedirectPreload(nodeOptions, apiFile) {
  const preload = redirectPreload(apiFile);
  const current = nodeOptions ?? '';
  return current.split(' ').includes(preload) ? current : `${current} ${preload}`.trim();
}

export function redirectTypeScriptApi(apiFile, environment) {
  if (typeof nodeModule.registerHooks !== 'function') {
    throw new Error(
      "The project's typescript package has no JavaScript API (TypeScript 7 or later), so nitpicker " +
        'reads source files with its own TypeScript 6, which needs module.registerHooks: run nitpicker ' +
        'on Node.js 22.15 or newer.',
    );
  }
  nodeModule.registerHooks({ resolve: apiResolution(pathToFileURL(apiFile).href) });
  environment.NODE_OPTIONS = withRedirectPreload(environment.NODE_OPTIONS, apiFile);
}
