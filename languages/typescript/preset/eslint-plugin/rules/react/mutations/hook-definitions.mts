import { readFileSync } from 'node:fs';
import { resolveModuleSpecifier as untypedResolve } from '../../../../modules/module-resolution.mjs';

type Resolution = { readonly kind: string; readonly path?: string };

const resolveModuleSpecifier: (written: string, containingFile: string) => Resolution =
  untypedResolve;

const NEXT_HOOK = /\n(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const)\s+use[A-Z]/u;
const failureHandler = /\b(?:onError|onSettled)\b/u;
const mutationCall = /\buseMutation\b/u;

function sourceOf(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function definitionOf(text: string, name: string): string | undefined {
  const start = new RegExp(`(?:function|const)\\s+${name}\\b`, 'u').exec(text)?.index;
  if (start === undefined) {
    return undefined;
  }
  const rest = text.slice(start + name.length);
  const end = NEXT_HOOK.exec(rest)?.index ?? rest.length;
  return rest.slice(0, end);
}

export function projectHookLacksFailureHandler(
  specifier: string,
  filename: string,
  name: string,
): boolean {
  const resolved = resolveModuleSpecifier(specifier, filename);
  const text = resolved.kind === 'file' && resolved.path ? sourceOf(resolved.path) : undefined;
  const definition = text === undefined ? undefined : definitionOf(text, name);
  return (
    definition !== undefined && mutationCall.test(definition) && !failureHandler.test(definition)
  );
}
