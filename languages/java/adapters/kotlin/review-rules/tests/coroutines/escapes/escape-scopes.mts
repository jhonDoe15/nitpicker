import type { TestScanned } from '../../typed/discovery-types.mts';
import { groupOf } from '../../typed/indexing.mts';
import type {
  ReceiverContext,
  ScopeContext,
  ScopeKind,
  ScopeReceiver,
} from '../../typed/rule-types.mts';
import { functionsOf } from '../../discovery/functions.mts';
import { importsOf } from '../../discovery/imports.mts';
import { matchingOpen, trimmedEnd, wordBefore } from '../../discovery/text-scan.mts';
import { classifyContext } from '../delays/dispatchers.mts';

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

function argumentsKind(text: string, context: ScopeContext): ScopeKind {
  const call = SCOPE_ARGS.exec(text);
  if (call === null) {
    return 'real';
  }
  const open = call.index + call[0].length - 1;
  const close = Array.from(text.slice(open)).reduce(
    (state: { depth: number; end: number }, char, index) => {
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

export function kindOfText(text: string, context: ScopeContext): ScopeKind | undefined {
  if (TEST_SCOPE.test(text)) {
    return 'test';
  }
  if (SCOPE_CALL.test(text)) {
    return argumentsKind(text, context);
  }
  const name = /([A-Za-z_]\w*)(?:\s*\(\s*\))?\s*$/u.exec(text)?.[1];
  return name === undefined ? undefined : namedKind(name, text, context);
}

function namedKind(name: string, text: string, context: ScopeContext): ScopeKind | undefined {
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

export function declaredScopes(
  code: string,
  context: Omit<ScopeContext, 'scopes'>,
): Map<string, ScopeKind | undefined> {
  const kinds = new Map<string, ScopeKind | typeof AMBIGUOUS | undefined>();
  for (const match of code.matchAll(DECLARATION)) {
    const text = `${match[2] ?? ''} ${match[3] ?? ''}`;
    const kind =
      TEST_SCOPE.test(text) || SCOPE_CALL.test(text)
        ? kindOfText(text, { ...context, scopes: new Map() })
        : AMBIGUOUS;
    const known = kinds.get(groupOf(match, 1));
    kinds.set(groupOf(match, 1), known === undefined || known === kind ? kind : AMBIGUOUS);
  }
  return new Map(
    [...kinds].flatMap(([name, kind]) => (kind === AMBIGUOUS ? [] : ([[name, kind]] as const))),
  );
}

export function scopeFactories(scanned: TestScanned): Set<string> {
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

export function globalScopeAliases(scanned: TestScanned): Set<string> {
  return new Set(
    [...importsOf(scanned).aliases]
      .filter(([, { qualified }]) => qualified === GLOBAL_SCOPE)
      .map(([alias]) => alias),
  );
}

function lambdaParameter(code: string, open: number): string {
  return LAMBDA_PARAMETER.exec(code.slice(open, open + LAMBDA_WINDOW))?.[1] ?? 'it';
}

function callReceiver(context: ReceiverContext, end: number): ScopeReceiver | undefined {
  const open = matchingOpen(context, end - 1);
  if (open < 0) {
    return undefined;
  }
  const { start } = wordBefore(context, open);
  const kind = kindOfText(context.code.slice(start, end), context);
  return kind === undefined ? undefined : { kind };
}

function namedReceiver(context: ReceiverContext, name: string): ScopeReceiver | undefined {
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

export function receiverOf(context: ReceiverContext, dotIndex: number): ScopeReceiver | undefined {
  const { code } = context;
  const end = trimmedEnd(context, dotIndex);
  if (code[end - 1] === ')') {
    return callReceiver(context, end);
  }
  const { word: name, start } = wordBefore(context, end);
  if (ANDROID_SCOPE.test(name)) {
    const kind = namedKind(name, name, context);
    return kind === undefined ? undefined : { kind };
  }
  const before = code.slice(Math.max(0, start - DOT_WINDOW), start).trimEnd();
  if (name === '' || (before.endsWith('.') && !before.endsWith('this.'))) {
    return undefined;
  }
  return namedReceiver(context, name);
}

export function implicitReceiver(context: ReceiverContext): ScopeReceiver | undefined {
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
