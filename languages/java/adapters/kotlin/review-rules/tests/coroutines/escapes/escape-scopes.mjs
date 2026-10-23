import { functionsOf } from '../../discovery/functions.mjs';
import { importsOf } from '../../discovery/imports.mjs';
import { matchingOpen, trimmedEnd, wordBefore } from '../../discovery/text-scan.mjs';
import { classifyContext } from '../delays/dispatchers.mjs';

const SCOPE_CALL = /\b(?:CoroutineScope|MainScope|CloseableCoroutineScope)\b/u;
const SCOPE_ARGS = /\b(?:CoroutineScope|CloseableCoroutineScope)\s*\(/u;
const TEST_SCOPE = /\bTest(?:Coroutine)?Scope\b/u;
const ANDROID_SCOPE = /^(?:lifecycleScope|viewModelScope)$/u;
const DECLARATION = /\b(?:val|var)\s+([A-Za-z_]\w*)\s*(?::\s*([\w.]+))?\s*(?:=\s*([^\n]*))?/gu;
const SCOPE_RETURN = /^\s*(?:CoroutineScope|MainScope|CloseableCoroutineScope)\b/u;
const LAMBDA_PARAMETER = /^\{\s*([A-Za-z_]\w*)\s*->/u;
const GLOBAL_SCOPE = 'kotlinx.coroutines.GlobalScope';
const IT_HOSTS = new Set(['also', 'let', 'takeIf', 'takeUnless']);
const THIS_HOSTS = new Set(['run', 'apply', 'with']);
const STRUCTURED = new Set(
  [
    'runTest runBlocking runBlockingTest coroutineScope supervisorScope withContext withTimeout',
    'withTimeoutOrNull launch async produce flow channelFlow callbackFlow fun class object',
  ]
    .join(' ')
    .split(' '),
);
const LAMBDA_WINDOW = 80;
const DOT_WINDOW = 8;
const AMBIGUOUS = 'ambiguous';

function argumentsKind(text, context) {
  const call = SCOPE_ARGS.exec(text);
  if (call === null) {
    return 'real';
  }
  const open = call.index + call[0].length - 1;
  const close = [...text.slice(open)].reduce(
    (state, char, index) => {
      if (state.end >= 0) {
        return state;
      }
      const depth = state.depth + (char === '(' ? 1 : 0) - (char === ')' ? 1 : 0);
      return { depth, end: depth === 0 ? open + index : -1 };
    },
    { depth: 0, end: -1 },
  ).end;
  const args = text.slice(open + 1, close < 0 ? text.length : close);
  const kind = classifyContext(args, context.declarations, context.project);
  if (kind === 'virtual' || (kind === 'unknown' && /\bcoroutineContext\b/u.test(args))) {
    return 'test';
  }
  return 'real';
}

export function kindOfText(text, context) {
  if (TEST_SCOPE.test(text)) {
    return 'test';
  }
  if (SCOPE_CALL.test(text)) {
    return argumentsKind(text, context);
  }
  const name = /([A-Za-z_]\w*)(?:\s*\(\s*\))?\s*$/u.exec(text)?.[1];
  return name === undefined ? undefined : namedKind(name, text, context);
}

function namedKind(name, text, context) {
  if (ANDROID_SCOPE.test(name)) {
    return context.project.mainReplaced ? 'test' : 'real';
  }
  if (context.aliases.has(name)) {
    return 'real';
  }
  if (/\(\s*\)\s*$/u.test(text)) {
    return context.factories.has(name) ? 'real' : undefined;
  }
  return context.scopes.get(name);
}

export function declaredScopes(code, context) {
  const kinds = new Map();
  for (const match of code.matchAll(DECLARATION)) {
    const text = `${match[2] ?? ''} ${match[3] ?? ''}`;
    const kind =
      TEST_SCOPE.test(text) || SCOPE_CALL.test(text)
        ? kindOfText(text, { ...context, scopes: new Map() })
        : AMBIGUOUS;
    const known = kinds.get(match[1]);
    kinds.set(match[1], known === undefined || known === kind ? kind : AMBIGUOUS);
  }
  return new Map([...kinds].filter(([, kind]) => kind !== AMBIGUOUS));
}

export function scopeFactories(scanned) {
  const { code } = scanned;
  return new Set(
    functionsOf(scanned)
      .filter(({ body }) => {
        const text = code.slice(body.start, body.end);
        return (
          SCOPE_RETURN.test(body.returns) ||
          (body.expression && SCOPE_CALL.test(text) && !TEST_SCOPE.test(text))
        );
      })
      .map(({ name }) => name),
  );
}

export function globalScopeAliases(scanned) {
  return new Set(
    [...importsOf(scanned).aliases]
      .filter(([, { qualified }]) => qualified === GLOBAL_SCOPE)
      .map(([alias]) => alias),
  );
}

function lambdaParameter(code, open) {
  return LAMBDA_PARAMETER.exec(code.slice(open, open + LAMBDA_WINDOW))?.[1] ?? 'it';
}

function callReceiver(context, end) {
  const open = matchingOpen(context, end - 1);
  if (open < 0) {
    return undefined;
  }
  const { start } = wordBefore(context, open);
  const kind = kindOfText(context.code.slice(start, end), context);
  return kind === undefined ? undefined : { kind };
}

function namedReceiver(context, name) {
  const viaLambda = context.hosts
    .toReversed()
    .find((host) => IT_HOSTS.has(host.name) && lambdaParameter(context.code, host.open) === name);
  const kind =
    viaLambda === undefined
      ? namedKind(name, name, context)
      : kindOfText(viaLambda.receiver, context);
  if (kind === undefined) {
    return undefined;
  }
  return viaLambda === undefined && context.scopes.has(name) ? { kind, name } : { kind };
}

export function receiverOf(context, dotIndex) {
  const { code } = context;
  const end = trimmedEnd(context, dotIndex);
  if (code[end - 1] === ')') {
    return callReceiver(context, end);
  }
  const { word: name, start } = wordBefore(context, end);
  if (ANDROID_SCOPE.test(name)) {
    return { kind: namedKind(name, name, context) };
  }
  const before = code.slice(Math.max(0, start - DOT_WINDOW), start).trimEnd();
  if (name === '' || (before.endsWith('.') && !before.endsWith('this.'))) {
    return undefined;
  }
  return namedReceiver(context, name);
}

export function implicitReceiver(context) {
  for (const host of context.hosts.toReversed()) {
    if (THIS_HOSTS.has(host.name)) {
      const text = host.name === 'with' ? host.args : host.receiver;
      const kind = kindOfText(text, context);
      return kind === undefined ? undefined : { kind };
    }
    if (STRUCTURED.has(host.name)) {
      return undefined;
    }
  }
  return undefined;
}
