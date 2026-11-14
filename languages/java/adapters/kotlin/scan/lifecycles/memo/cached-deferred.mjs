import { escapeRegExp } from '../../../../../../../shared/paths/glob.mjs';
import { closingIndex } from '../../kotlin-source.mjs';
import { scopesOf } from '../scopes/class-scopes.mjs';

const RULE = 'CachedDeferredKeepsFailure';
const MESSAGES = {
  [RULE]:
    'This property caches a Deferred or future and later calls reuse it, but nothing resets it when the attempt fails, so a first failure is replayed to every later caller instead of being retried. Reset it on failure and only while it still holds this attempt (`val attempt = scope.async { open() }; conn = attempt; attempt.invokeOnCompletion { if (it != null && conn === attempt) conn = null }`), and do not wrap the attempt in `by lazy`. An exception fits only when keeping the first failure is intended.',
};
const HOLDER_TYPE = /\b(?:Deferred|CompletableDeferred|CompletableFuture|Future)\b/;
const STARTS_ATTEMPT = /\b(?:async|supplyAsync|future|CompletableDeferred)\b/;
const FAILURE_HOOK =
  /\b(?:catch\s*\(|invokeOnCompletion|whenComplete|exceptionally|handle\s*[({]|onFailure|finally)\b/;

function lazyAttempt(code, property) {
  const lazy = /\bby\s+lazy\b/.exec(property.text);
  if (lazy === null) {
    return false;
  }
  const open = code.indexOf('{', property.offset + lazy.index);
  return open !== -1 && STARTS_ATTEMPT.test(code.slice(open, closingIndex(code, open)));
}

function attemptLocals(text) {
  const starts = new RegExp(
    String.raw`\b(?:val|var)\s+(\w+)\s*(?::[^=\n]+)?=[^\n]*${STARTS_ATTEMPT.source}`,
    'g',
  );
  return [...text.matchAll(starts)].map((match) => escapeRegExp(match[1]));
}

function cachesAttempt(text, name) {
  const target = escapeRegExp(name);
  const assign = String.raw`\b${target}\s*(?:=|\?:)\s*`;
  const assignments = [
    new RegExp(`${assign}[^\\n]*${STARTS_ATTEMPT.source}`),
    ...attemptLocals(text).map((local) => new RegExp(String.raw`${assign}${local}\b`)),
  ];
  const reused = new RegExp(
    String.raw`\b${target}\s*(?:\?:|==\s*null|\??\.\s*await\b)|\breturn\s+${target}\b`,
  );
  return assignments.some((assigned) => assigned.test(text)) && reused.test(text);
}

function resetsOnFailure(code, scope, name) {
  const clear = new RegExp(String.raw`\b${escapeRegExp(name)}\s*=\s*null\b`);
  return scope.functions.some((fn) => {
    const body = code.slice(fn.open, fn.end);
    const found = clear.exec(body);
    return found !== null && FAILURE_HOOK.test(body.slice(0, found.index));
  });
}

export function cachedDeferredKeepsFailure(scanned) {
  const { code } = scanned;
  return scopesOf(code).flatMap((scope) => {
    const text = code.slice(scope.body.open, scope.body.end);
    return scope.properties
      .filter((property) =>
        lazyAttempt(code, property)
          ? true
          : property.kind === 'var' &&
            HOLDER_TYPE.test(property.text) &&
            cachesAttempt(text, property.name) &&
            !resetsOnFailure(code, scope, property.name),
      )
      .map((property) => ({ rule: RULE, offset: property.offset }));
  });
}

export const kotlinSourceRules = { messages: MESSAGES, main: [cachedDeferredKeepsFailure] };
