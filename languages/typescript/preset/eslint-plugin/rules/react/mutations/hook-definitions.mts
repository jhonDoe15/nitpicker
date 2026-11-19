import { readFileSync } from 'node:fs';
import { escapeRegExp as untypedEscape } from '../../../../../../../shared/paths/glob.mjs';
import { resolveModuleSpecifier as untypedResolve } from '../../../../modules/module-resolution.mjs';

type Resolution = { readonly kind: string; readonly path?: string };

const resolveModuleSpecifier: (written: string, containingFile: string) => Resolution =
  untypedResolve;

const escapeRegExp: (value: string) => string = untypedEscape;

const NEXT_HOOK = /\n(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const)\s+use[A-Z]/u;
const failureHandler = /\b(?:onError|onSettled)\b/u;
const mutationCall = /\buseMutation\b/u;

type Source = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'unreadable' };

function sourceOf(file: string): Source {
  try {
    return { kind: 'text', text: readFileSync(file, 'utf8') };
  } catch {
    return { kind: 'unreadable' };
  }
}

function definitionOf(text: string, name: string): string | undefined {
  const start = new RegExp(`(?:function|const)\\s+${escapeRegExp(name)}\\b`, 'u').exec(text)?.index;
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
  const source = resolved.kind === 'file' && resolved.path ? sourceOf(resolved.path) : undefined;
  const definition = source?.kind === 'text' ? definitionOf(source.text, name) : undefined;
  return (
    definition !== undefined && mutationCall.test(definition) && !failureHandler.test(definition)
  );
}
