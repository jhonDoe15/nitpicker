import nodeModule, { type ResolveFnOutput, type ResolveHookContext } from 'node:module';
import { isMainThread } from 'node:worker_threads';
import { shimUrl } from './hook-shims.mts';

type NextResolve = (specifier: string, context?: Partial<ResolveHookContext>) => ResolveFnOutput;

const PACKAGE_SOURCE = '/node_modules/dependency-cruiser/src/';

const REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  ['extract/index.mjs ./extract-dependencies.mjs', 'extract-dependencies'],
  ['extract/transpile/index.mjs ./typescript-wrap.mjs', 'typescript-wrap'],
  ['extract/resolve/index.mjs ./get-manifest.mjs', 'get-manifest'],
  ['extract/resolve/get-manifest.mjs ./merge-manifests.mjs', 'merge-manifests'],
]);

function replacementFor(specifier: string, parentUrl: string | undefined): string | undefined {
  const at = parentUrl?.lastIndexOf(PACKAGE_SOURCE) ?? -1;
  if (parentUrl === undefined || at < 0) {
    return undefined;
  }
  const name = REPLACEMENTS.get(`${parentUrl.slice(at + PACKAGE_SOURCE.length)} ${specifier}`);
  const original = URL.parse(specifier, parentUrl);
  return name === undefined || original === null ? undefined : shimUrl(name, original.href);
}

export function resolve(
  specifier: string,
  context: ResolveHookContext,
  nextResolve: NextResolve,
): ResolveFnOutput {
  const url = replacementFor(specifier, context.parentURL);
  return url === undefined ? nextResolve(specifier, context) : { url, shortCircuit: true };
}

if (typeof nodeModule.registerHooks === 'function') {
  nodeModule.registerHooks({ resolve });
} else if (isMainThread) {
  nodeModule.register(import.meta.url);
}
