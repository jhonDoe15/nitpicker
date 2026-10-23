import { existsSync } from 'node:fs';
import nodeModule from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API_SPECIFIER = /^typescript(?:\/package\.json|\/lib\/.+)?$/u;
const MINIMUM_NODE = [22, 19];
const UNRESOLVED_CODES = new Set([
  'ERR_MODULE_NOT_FOUND',
  'MODULE_NOT_FOUND',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
]);

export function hasJavaScriptApi(resolvedFile) {
  return existsSync(path.join(path.dirname(resolvedFile), 'typescript.js'));
}

export function packageHasJavaScriptApi(packageRoot) {
  return existsSync(path.join(packageRoot, 'lib/typescript.js'));
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

function apiFile(apiRoot, specifier) {
  if (specifier === 'typescript') {
    return path.join(apiRoot, 'lib/typescript.js');
  }
  const file = path.join(apiRoot, specifier.slice('typescript/'.length));
  return path.extname(file) === '' ? `${file}.js` : file;
}

export function apiResolution(apiRoot) {
  return (specifier, context, nextResolve) => {
    if (!API_SPECIFIER.test(specifier)) {
      return nextResolve(specifier, context);
    }
    const installed = resolvedOrUndefined(nextResolve, 'typescript', context);
    if (
      installed?.url.startsWith('file:') === true &&
      hasJavaScriptApi(fileURLToPath(installed.url))
    ) {
      return nextResolve(specifier, context);
    }
    const file = apiFile(apiRoot, specifier);
    return {
      url: pathToFileURL(file).href,
      format: path.extname(file) === '.json' ? 'json' : 'commonjs',
      shortCircuit: true,
    };
  };
}

function redirectPreload(apiRoot) {
  const source =
    `import { redirectTypeScriptApi } from ${JSON.stringify(import.meta.url)};` +
    `redirectTypeScriptApi(${JSON.stringify(apiRoot)}, process.env);`;
  return `--import=data:text/javascript,${encodeURIComponent(source)}`;
}

export function withRedirectPreload(nodeOptions, apiRoot) {
  const preload = redirectPreload(apiRoot);
  const current = nodeOptions ?? '';
  return current.split(' ').includes(preload) ? current : `${current} ${preload}`.trim();
}

export function supportsRedirect(versions = process.versions, hooks = nodeModule.registerHooks) {
  const [major, minor] = versions.node.split('.').map(Number);
  const [minimumMajor, minimumMinor] = MINIMUM_NODE;
  const recentEnough = major > minimumMajor || (major === minimumMajor && minor >= minimumMinor);
  return recentEnough && typeof hooks === 'function';
}

export function redirectTypeScriptApi(apiRoot, environment) {
  if (!supportsRedirect()) {
    throw new Error(
      'The typescript package nitpicker resolves has no JavaScript API (it is TypeScript 7 or later, ' +
        'or no typescript is installed), so nitpicker reads source files with its own TypeScript 6, ' +
        `which needs Node.js ${MINIMUM_NODE.join('.')} or newer; this is Node.js ${process.versions.node}.`,
    );
  }
  nodeModule.registerHooks({ resolve: apiResolution(apiRoot) });
  environment.NODE_OPTIONS = withRedirectPreload(environment.NODE_OPTIONS, apiRoot);
}
