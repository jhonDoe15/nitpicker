import { literalAt, literalsIn } from '../kotlin-source.mjs';
import { logCalls } from '../log-calls.mjs';
import { isConstantExpression, templatePieces } from '../security/sql-values.mjs';

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

const MESSAGE_LEVELS = new Set(['info', 'warn', 'error', 'log', 'config', 'warning', 'severe']);
const OPERAND_MARK = /[()[\]{}+]/g;
export const CALL_MESSAGES = {
  LogStringConcatenation:
    'Pass values as placeholders (`log.info("user {}", user)`), or give a lambda logger the message (`logger.info { "user $user" }`), not a message built with a string template, `+` or `format`.',
  ShellCommand:
    'Run the program directly with an argument list (`ProcessBuilder("git", "log", ref)`), not through a shell with `-c`.',
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
