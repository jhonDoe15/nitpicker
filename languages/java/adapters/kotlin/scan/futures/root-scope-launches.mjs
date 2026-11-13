import { escapeRegExp } from '../../../../../../shared/paths/glob.mjs';
import { closingIndex } from '../kotlin-source.mjs';
import { skipSpace } from './future-completions.mjs';

const RULE = 'UnhandledRootCoroutine';
const ROOT_FACTORY = String.raw`(?:CoroutineScope|MainScope)\s*\(`;
const HANDLER = /CoroutineExceptionHandler/;
const HANDLER_DECLARATION = new RegExp(
  [
    String.raw`(?<![\w$])(?:va[lr]\s+([A-Za-z_]\w*)\s*(?::[^=\n]*)?=\s*CoroutineExceptionHandler`,
    String.raw`([A-Za-z_]\w*)\s*:\s*CoroutineExceptionHandler)`,
  ].join('|'),
  'g',
);
const DECLARED_ROOT = new RegExp(
  String.raw`(?<![\w$])va[lr]\s+([A-Za-z_]\w*)\s*(?::\s*CoroutineScope\??\s*)?=\s*(?=${ROOT_FACTORY})`,
  'g',
);
const PARENT_CONTEXT = new RegExp(
  [
    String.raw`(?<![\w$.])(?:coroutineContext|currentCoroutineContext)(?![\w$])`,
    String.raw`(?<![\w$.])(?:Supervisor)?Job\s*\(\s*[^)\s]`,
    String.raw`(?<![\w$.])\w*(?:[jJ]ob|[cC]ontext|[pP]arent)\b(?!\s*\()`,
  ].join('|'),
);
const SITE = /\s*\??\.\s*(launch|async)\s*(?:<[^>\n]*>\s*)?(?=[({])/y;
const CATCH = /^\s*catch\s*\(\s*\w+\s*:\s*([\w.]+)\s*\)\s*(?=\{)/;
const CATCH_ALL = /^(?:java\.lang\.|kotlin\.)?(?:Throwable|Exception)$/;
const FINALLY = /^\s*finally\s*(?=\{)/;
const DEFERRED = /(?<![\w$])va[lr]\s+([A-Za-z_]\w*)\s*(?::[^=\n]*)?=\s*$/;
const RESULT_WINDOW = 40;
const STATEMENT_START = /(?:^|[;{}\n])[ \t]*$/;

const MESSAGES = {
  [RULE]:
    'Handle the failure: build the scope with a handler, `CoroutineScope(SupervisorJob() + Dispatchers.Default + CoroutineExceptionHandler { _, error -> logger.error("...", error) })`, or catch it in the block, `try { ... } catch (error: Exception) { logger.error("...", error) }` (an `async` also needs its `Deferred` awaited). This launch or async runs in a scope of its own, with no CoroutineExceptionHandler in its context and a block that does not catch everything, so a failure in the block reaches the thread\'s uncaught-exception handler, which crashes an Android process and is only logged elsewhere, and the failure of an `async` nobody awaits is never reported. When a project runner handles the failure, name it in conventions kotlin.detachedWorkRunners: a launch inside its lambda, or on a scope with that name, is then skipped.',
};

function continues(code, from) {
  return /^\s*(?:\+|\??\.)/.test(
    code.slice(from, code.indexOf('\n', skipSpace(code, from)) + 1 || undefined),
  );
}

function continuationEnd(code, end) {
  const at = skipSpace(code, end);
  const bracket = code.slice(at).search(/[({]/);
  const lineEnd = code.indexOf('\n', at) === -1 ? code.length : code.indexOf('\n', at);
  return bracket !== -1 && at + bracket < lineEnd ? closingIndex(code, at + bracket) + 1 : lineEnd;
}

function expressionEnd(code, open) {
  const ends = [closingIndex(code, open) + 1];
  for (const end of ends) {
    if (end >= code.length || !continues(code, end)) {
      break;
    }
    ends.push(continuationEnd(code, end));
  }
  return ends.at(-1);
}

function handlerNames(code) {
  return new Set(
    [...code.matchAll(HANDLER_DECLARATION)].map(([, local, parameter]) => local ?? parameter),
  );
}

function mentionsHandler(text, handlers) {
  return (
    HANDLER.test(text) ||
    [...handlers].some((name) => new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(text))
  );
}

function carriesParent(factoryCall) {
  const open = factoryCall.indexOf('(');
  return PARENT_CONTEXT.test(factoryCall.slice(open, closingIndex(factoryCall, open) + 1));
}

function declarationCount(code, name) {
  const position = String.raw`(?:(?<![\w$])va[lr]\s+|[(,]\s*|\{\s*)`;
  const follows = String.raw`(?=\s*(?::|=(?!=)|->|,\s*\w+\s*->))`;
  return [...code.matchAll(new RegExp(`${position}${name}${follows}`, 'g'))].length;
}

function rootScopes(code, handlers) {
  const found = new Map();
  for (const { index, 0: text, 1: name } of code.matchAll(DECLARED_ROOT)) {
    const open = code.indexOf('(', index + text.length);
    const initializer = code.slice(index + text.length, expressionEnd(code, open));
    const own = !(mentionsHandler(initializer, handlers) || carriesParent(initializer));
    found.set(name, [...(found.get(name) ?? []), own]);
  }
  return new Map(
    [...found].flatMap(([name, owns]) => {
      return owns.every(Boolean) && declarationCount(code, name) === owns.length
        ? [[name, true]]
        : [];
    }),
  );
}

function clausesCatchAll(code, from, close) {
  const pending = [from];
  let caught = false;
  for (const at of pending) {
    const rest = code.slice(at, close);
    const clause = CATCH.exec(rest);
    const matched = clause ?? FINALLY.exec(rest);
    if (matched === null) {
      return caught && rest.trim() === '';
    }
    caught = caught || (clause !== null && CATCH_ALL.test(clause[1]));
    pending.push(closingIndex(code, at + matched[0].length) + 1);
  }
  return false;
}

function bodyCatchesEverything(code, open, close) {
  const start = open + 1 + code.slice(open + 1, close).search(/\S/);
  const text = code.slice(start, close);
  if (/^runCatching\s*\{/.test(text)) {
    const end = closingIndex(code, start + text.indexOf('{')) + 1;
    return /^(?:\??\.\w+\s*(?:\{[^]*\}\s*)?)*$/.test(code.slice(end, close).trim());
  }
  return (
    /^try\s*\{/.test(text) &&
    clausesCatchAll(code, closingIndex(code, start + text.indexOf('{')) + 1, close)
  );
}

function callParts(code, from) {
  let at = from;
  let args = '';
  if (code[at] === '(') {
    const close = closingIndex(code, at);
    args = code.slice(at, close + 1);
    at = skipSpace(code, close + 1);
  }
  if (code[at] !== '{') {
    return { args, lambda: undefined, end: at };
  }
  const close = closingIndex(code, at);
  return { args, lambda: { open: at, close }, end: close + 1 };
}

function asyncResultUsed(code, receiverStart, end) {
  const before = code.slice(code.lastIndexOf('\n', receiverStart - 1) + 1, receiverStart);
  if (STATEMENT_START.test(before)) {
    return /^\s*\??\./.test(code.slice(end, end + RESULT_WINDOW));
  }
  const declared = DEFERRED.exec(before);
  if (declared === null) {
    return true;
  }
  const name = declared[1];
  const uses = [
    ...code.matchAll(new RegExp(String.raw`(?<![\w$.])${escapeRegExp(name)}(?![\w$])`, 'g')),
  ];
  return uses.length > 1;
}

function runnerLambdas(code, runners) {
  return runners.flatMap((name) =>
    [...code.matchAll(new RegExp(String.raw`(?<![\w$.])${name}\s*(?=[({])`, 'g'))].flatMap(
      ({ index, 0: text }) => {
        const { lambda } = callParts(code, index + text.length);
        return lambda === undefined ? [] : [lambda];
      },
    ),
  );
}

function sitesOf(code, handlers, runners) {
  const scopes = new Map(
    [...rootScopes(code, handlers)].filter(([name]) => !runners.includes(name)),
  );
  const named = [...scopes.keys()].map((name) => ({ name }));
  const inline = [...code.matchAll(new RegExp(String.raw`(?<![\w$.])${ROOT_FACTORY}`, 'g'))].map(
    ({ index, 0: text }) => ({ index, text }),
  );
  const fromNames = named.flatMap(({ name }) =>
    [
      ...code.matchAll(
        new RegExp(String.raw`(?<![\w$.])${name}(?=\s*\??\.\s*(?:launch|async)\b)`, 'g'),
      ),
    ].map(({ index, 0: text }) => ({ start: index, after: index + text.length, scope: undefined })),
  );
  const fromInline = inline.flatMap(({ index, text }) => {
    const open = index + text.length - 1;
    const end = closingIndex(code, open) + 1;
    return [{ start: index, after: end, scope: code.slice(index, end) }];
  });
  return [...fromNames, ...fromInline];
}

export function unhandledRootCoroutines(scanned, context = {}) {
  const { code } = scanned;
  const handlers = handlerNames(code);
  const runners = context.runners ?? [];
  const guarded = runnerLambdas(code, runners);
  return sitesOf(code, handlers, runners)
    .flatMap(({ start, after, scope }) => {
      SITE.lastIndex = after;
      const site = SITE.exec(code);
      const inRunner = guarded.some(({ open, close }) => start > open && start < close);
      const handled =
        scope !== undefined && (mentionsHandler(scope, handlers) || carriesParent(scope));
      if (site === null || inRunner || handled) {
        return [];
      }
      const parts = callParts(code, SITE.lastIndex);
      const { lambda } = parts;
      const unhandled =
        lambda !== undefined &&
        !mentionsHandler(parts.args, handlers) &&
        !bodyCatchesEverything(code, lambda.open, lambda.close);
      const awaited = site[1] === 'async' && asyncResultUsed(code, start, parts.end);
      return unhandled && !awaited ? [{ rule: RULE, offset: start }] : [];
    })
    .toSorted((left, right) => left.offset - right.offset);
}

export const kotlinSourceRules = { messages: MESSAGES, main: [unhandledRootCoroutines] };
