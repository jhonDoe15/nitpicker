import { existsSync } from 'node:fs';
import nodeModule from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API_SPECIFIER = /^typescript(?:\/package\.json|\/lib\/.+)?$/u;
export const MINIMUM_NODE: readonly [number, number] = [22, 19];
const UNRESOLVED_CODES = new Set([
  'ERR_MODULE_NOT_FOUND',
  'MODULE_NOT_FOUND',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
]);

export function hasJavaScriptApi(resolvedFile: string): boolean {
  return existsSync(path.join(path.dirname(resolvedFile), 'typescript.js'));
}

export function packageHasJavaScriptApi(packageRoot: string): boolean {
  return existsSync(path.join(packageRoot, 'lib/typescript.js'));
}

type ResolveContext = { readonly parentURL?: string | undefined };
type ResolveResult = nodeModule.ResolveFnOutput;
type NextResolve = (specifier: string, context?: ResolveContext) => ResolveResult;
type ResolveHook = (
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
) => ResolveResult;

export function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

function resolvedOrUndefined(
  nextResolve: NextResolve,
  specifier: string,
  context: ResolveContext,
): ResolveResult | undefined {
  try {
    return nextResolve(specifier, context);
  } catch (error) {
    if (UNRESOLVED_CODES.has(String(errorCode(error)))) {
      return undefined;
    }
    throw error;
  }
}

function fromPackage(context: ResolveContext): boolean {
  return context.parentURL?.includes('/node_modules/') === true;
}

function apiFile(apiRoot: string, specifier: string): string {
  if (specifier === 'typescript') {
    return path.join(apiRoot, 'lib/typescript.js');
  }
  const file = path.join(apiRoot, specifier.slice('typescript/'.length));
  return path.extname(file) === '' ? `${file}.js` : file;
}

export function apiResolution(apiRoot: string): ResolveHook {
  return (specifier, context, nextResolve) => {
    if (!(API_SPECIFIER.test(specifier) && fromPackage(context))) {
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

function redirectPreload(apiRoot: string): string {
  const source =
    `import { redirectTypeScriptApi } from ${JSON.stringify(import.meta.url)};` +
    `process.env.NODE_OPTIONS = redirectTypeScriptApi(${JSON.stringify(apiRoot)}, process.env.NODE_OPTIONS);`;
  return `--import=data:text/javascript,${encodeURIComponent(source)}`;
}

export function withRedirectPreload(nodeOptions: string | undefined, apiRoot: string): string {
  const preload = redirectPreload(apiRoot);
  const current = nodeOptions ?? '';
  return current.split(' ').includes(preload) ? current : `${current} ${preload}`.trim();
}

export function supportsRedirect(
  versions: { node: string } = process.versions,
  hooks: unknown = nodeModule.registerHooks,
): boolean {
  const [major = 0, minor = 0] = versions.node.split('.').map(Number);
  const [minimumMajor, minimumMinor] = MINIMUM_NODE;
  const recentEnough = major > minimumMajor || (major === minimumMajor && minor >= minimumMinor);
  return recentEnough && typeof hooks === 'function';
}

export function redirectTypeScriptApi(apiRoot: string, nodeOptions: string | undefined): string {
  if (!supportsRedirect()) {
    throw new Error(
      'The typescript package nitpicker resolves has no JavaScript API (it is TypeScript 7 or later, ' +
        'or no typescript is installed), so nitpicker reads source files with its own TypeScript 6, ' +
        `which needs Node.js ${MINIMUM_NODE.join('.')} or newer; this is Node.js ${process.versions.node}.`,
    );
  }
  nodeModule.registerHooks({ resolve: apiResolution(apiRoot) });
  return withRedirectPreload(nodeOptions, apiRoot);
}
