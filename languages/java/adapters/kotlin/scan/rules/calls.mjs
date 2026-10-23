import { literalAt, literalsIn } from '../kotlin-source.mjs';
import { logCalls } from '../log-calls.mjs';
import { isConstantExpression, templatePieces } from '../security/sql-values.mjs';
import { isPagingLoop, loopBodies, retryAttempts } from '../loops.mjs';
import { fanOutCallOffsets } from '../fan-out/fan-out.mjs';

const SHELLS = new Set([
  'sh',
  'bash',
  'zsh',
  'dash',
  'ksh',
  '/bin/sh',
  '/bin/bash',
  '/bin/zsh',
  '/usr/bin/sh',
  '/usr/bin/bash',
  '/usr/bin/zsh',
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
]);
const SHELL_FLAGS = new Set(['-c', '/c', '/C', '-Command', '-command']);
const LITERAL_PAIR = /"\s*,\s*"/g;
const FORMATTED = /(?:\bString\s*\.\s*format|"\s*\.\s*format(?:ted)?)\s*\(/;

const IO_RECEIVER_NAMES = [
  'repo',
  'repository',
  'dao',
  'jdbc',
  'jdbcTemplate',
  'restTemplate',
  'client',
  'webClient',
  'httpClient',
  'connection',
  'statement',
  'entityManager',
  'gateway',
  'api',
];
const IO_RECEIVER_SUFFIXES = [
  'Repo',
  'Repository',
  'Dao',
  'DAO',
  'Client',
  'Connection',
  'Statement',
  'EntityManager',
  'Gateway',
  'Api',
  'API',
  'Template',
];
const IO_RECEIVER = new RegExp(
  `^(?:${IO_RECEIVER_NAMES.join('|')})$|(?:${IO_RECEIVER_SUFFIXES.join('|')})$`,
);
const IO_PREFIXES =
  'find|load|read|query|select|insert|update|delete|exists|count|execute|fetch|list|write';
const IO_VERBS = 'get|send|post|put|patch|exchange|retrieve|save';
const IO_METHOD = new RegExp(`^(?:${IO_PREFIXES})(?:[A-Z0-9_]|$)|^(?:${IO_VERBS})$`);
const BATCH_METHODS = new Set([
  'saveAll',
  'saveAllAndFlush',
  'deleteAll',
  'deleteAllById',
  'deleteAllInBatch',
  'findAllById',
]);
const MEMBER_CALL = /\b([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*\(/g;
const MESSAGE_LEVELS = new Set(['info', 'warn', 'error', 'log', 'config', 'warning', 'severe']);
const OPERAND_MARK = /[()[\]{}+]/g;
export const CALL_MESSAGES = {
  LogStringConcatenation:
    'Pass values as placeholders (`log.info("user {}", user)`), or give a lambda logger the message (`logger.info { "user $user" }`), not a message built with a string template, `+` or `format`.',
  ShellCommand:
    'Run the program directly with an argument list (`ProcessBuilder("git", "log", ref)`), not through a shell with `-c`.',
  IoCallInLoop:
    'Fetch or write all items at once (`findAllById`, `saveAll`, `deleteAll`, `WHERE id IN (...)`, one batched request): this calls a database, HTTP or repository API once per loop item. Paging, polling and retry loops are fine.',
};

function operands(code, start, end) {
  const parts = [];
  let depth = 0;
  let from = start;
  for (const { index, 0: mark } of code.slice(start, end).matchAll(OPERAND_MARK)) {
    if (mark === '+' && depth === 0) {
      parts.push({ start: from, end: start + index });
      from = start + index + 1;
    } else if (mark !== '+') {
      depth += '([{'.includes(mark) ? 1 : -1;
    }
  }
  return [...parts, { start: from, end }];
}

function isConstantOperand(scanned, operand) {
  const text = scanned.code.slice(operand.start, operand.end);
  const start = operand.start + text.length - text.trimStart().length;
  const literal = literalAt(scanned, start);
  if (literal !== undefined && literal.end - start === text.trim().length) {
    return templatePieces(literal).every(
      (piece) => piece.text !== undefined || isConstantExpression(piece.expression, scanned),
    );
  }
  return isConstantExpression(scanned.source.slice(operand.start, operand.end).trim(), scanned);
}

function builtMessage(scanned, argument) {
  const text = scanned.code.slice(argument.start, argument.end);
  if (literalsIn(scanned, argument.start, argument.end).length === 0) {
    return false;
  }
  return (
    FORMATTED.test(text) ||
    operands(scanned.code, argument.start, argument.end).some(
      (operand) => !isConstantOperand(scanned, operand),
    )
  );
}

function messageOf(call) {
  return call.method === 'log' && call.arguments.length > 1 ? call.arguments[1] : call.arguments[0];
}

export function logTemplates(scanned) {
  return logCalls(scanned.code).flatMap((call) => {
    const message = messageOf(call);
    return MESSAGE_LEVELS.has(call.method) &&
      message !== undefined &&
      builtMessage(scanned, message)
      ? [{ rule: 'LogStringConcatenation', offset: call.start }]
      : [];
  });
}

export function shellCommands(scanned) {
  return [...scanned.code.matchAll(LITERAL_PAIR)].flatMap(({ index, 0: text }) => {
    const second = literalAt(scanned, index + text.length - 1);
    const first = scanned.literals.find(({ end }) => end === index + 1);
    if (first === undefined || second === undefined) {
      return [];
    }
    return SHELLS.has(first.text) && SHELL_FLAGS.has(second.text)
      ? [{ rule: 'ShellCommand', offset: first.start, subject: `${first.text} ${second.text}` }]
      : [];
  });
}

function isIoCall(receiver, method) {
  return (
    IO_RECEIVER.test(receiver) &&
    IO_METHOD.test(method) &&
    !BATCH_METHODS.has(method) &&
    !(/^(?:is|has|get)[A-Z]/.test(method) && !/^get(?:By|All|One|Reference|For)/.test(method))
  );
}

function readsIo(text) {
  return [...text.matchAll(MEMBER_CALL)].some(([, receiver, method]) => isIoCall(receiver, method));
}

function ioCalls(code, loop, isRetryAttempt) {
  if (isPagingLoop(code, loop, readsIo)) {
    return [];
  }
  const body = code.slice(loop.open, loop.close);
  return [...body.matchAll(MEMBER_CALL)]
    .filter(
      ([, receiver, method]) => isIoCall(receiver, method) && !loop.variables.includes(receiver),
    )
    .map(({ index }) => loop.open + index)
    .filter((offset) => !isRetryAttempt(loop, offset));
}

export function ioInLoops(scanned) {
  const isRetryAttempt = retryAttempts(scanned.code);
  const fannedOut = fanOutCallOffsets(scanned);
  const offsets = new Set(
    loopBodies(scanned.code).flatMap((loop) => ioCalls(scanned.code, loop, isRetryAttempt)),
  );
  return [...offsets]
    .filter((offset) => !fannedOut.has(offset))
    .toSorted((left, right) => left - right)
    .map((offset) => ({
      rule: 'IoCallInLoop',
      offset,
    }));
}
