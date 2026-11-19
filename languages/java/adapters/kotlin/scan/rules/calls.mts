import { isCompositionRoot, literalAt, literalsIn } from '../kotlin-source.mts';
import { logCalls } from '../log-calls.mts';
import { operands } from '../logging/log-format-rules.mts';
import { isConstantExpression, templatePieces } from '../security/sql-values.mts';
import type { Scanned } from '../typed/scan-shapes.mts';
import type { ReportedCall } from '../log-calls.mts';
import type { Span } from '../typed/rule-shapes.mts';

type Flagged = { rule: string; offset: number; subject: string };

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
const STANDARD_STREAM =
  /(?<![\w.])(?:java\s*\.\s*lang\s*\.\s*)?`?System`?\s*\??\.\s*`?(?:out|err)`?(?!\w)/g;
const CALL_MESSAGES = {
  LogStringConcatenation:
    'Pass values as placeholders (`log.info("user {}", user)`), or give a lambda logger the message (`logger.info { "user $user" }`), not a message built with a string template, `+` or `format`.',
  ShellCommand:
    'Run the program directly with an argument list (`ProcessBuilder("git", "log", ref)`), not through a shell with `-c`.',
  StandardStreamOutsideEntryPoint:
    'Take an `Appendable`, `PrintStream` or `Writer` parameter and write to it (`out.append(text)`, `out.println(text)`); the file with `fun main` passes `System.out` or `System.err`. An exception fits only for a program entry point the gate does not recognize as a composition root.',
};

function isConstantOperand(scanned: Scanned, operand: Span): boolean {
  const text = scanned.code.slice(operand.start, operand.end);
  const start = operand.start + text.length - text.trimStart().length;
  const literal = literalAt(scanned, start);
  if (literal !== undefined && literal.end - start === text.trim().length) {
    return templatePieces(literal).every(
      (piece) =>
        'text' in piece ||
        ('expression' in piece && isConstantExpression(piece.expression, scanned)),
    );
  }
  return isConstantExpression(scanned.source.slice(operand.start, operand.end).trim(), scanned);
}

function builtMessage(scanned: Scanned, argument: Span): boolean {
  const text = scanned.code.slice(argument.start, argument.end);
  if (literalsIn(scanned, argument.start, argument.end).length === 0) {
    return false;
  }
  return (
    FORMATTED.test(text) ||
    operands(scanned.code, argument).some((operand) => !isConstantOperand(scanned, operand))
  );
}

function messageOf(call: ReportedCall): Span | undefined {
  return call.method === 'log' && call.arguments.length > 1 ? call.arguments[1] : call.arguments[0];
}

export function logTemplates(scanned: Scanned): { rule: string; offset: number }[] {
  return logCalls(scanned.code).flatMap((call) => {
    const message = messageOf(call);
    return MESSAGE_LEVELS.has(call.method) &&
      message !== undefined &&
      builtMessage(scanned, message)
      ? [{ rule: 'LogStringConcatenation', offset: call.start }]
      : [];
  });
}

export function shellCommands(scanned: Scanned): Flagged[] {
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

export function standardStreams(scanned: Scanned): { rule: string; offset: number }[] {
  if (isCompositionRoot(scanned)) {
    return [];
  }
  return [...scanned.contextCode.matchAll(STANDARD_STREAM)].map(({ index }) => ({
    rule: 'StandardStreamOutsideEntryPoint',
    offset: index,
  }));
}

export const kotlinSourceRules = {
  messages: CALL_MESSAGES,
  main: [logTemplates, shellCommands, standardStreams],
};
