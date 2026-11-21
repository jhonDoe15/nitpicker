import nodeModule, { type ResolveFnOutput, type ResolveHookContext } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mts';

type NextResolve = (specifier: string, context?: Partial<ResolveHookContext>) => ResolveFnOutput;

const PACKAGE_SOURCE = '/node_modules/dependency-cruiser/src/';

const REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  ['extract/index.mjs ./extract-dependencies.mjs', 'extract-dependencies'],
  ['extract/transpile/index.mjs ./typescript-wrap.mjs', 'typescript-wrap'],
  ['extract/resolve/index.mjs ./get-manifest.mjs', 'get-manifest'],
  ['extract/resolve/get-manifest.mjs ./merge-manifests.mjs', 'merge-manifests'],
]);

function replacementModule(name: string): string {
  return checkoutModuleUrl(pathToFileURL(path.join(import.meta.dirname, `${name}.mjs`))).href;
}

function replacementFor(specifier: string, parentUrl: string | undefined): string | undefined {
  const at = parentUrl?.lastIndexOf(PACKAGE_SOURCE) ?? -1;
  if (parentUrl === undefined || at < 0) return undefined;
  const name = REPLACEMENTS.get(`${parentUrl.slice(at + PACKAGE_SOURCE.length)} ${specifier}`);
  if (name === undefined) return undefined;
  const original = new URL(specifier, parentUrl).href;
  return `${replacementModule(name)}?original=${encodeURIComponent(original)}`;
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
