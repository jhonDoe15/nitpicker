import { closingIndex, literalAt, literalsIn } from '../kotlin-source.mjs';
import { logCalls } from '../log-calls.mjs';

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
const CONCATENATED = /"\s*\+|\+\s*"/;

const LOOP_HEADER = /\bfor\s*\(\s*(?:\(([^)]*)\)|([A-Za-z_]\w*))[^)]*\bin\b|\bwhile\s*\(/g;
const DO_LOOP = /\bdo\s*\{/g;
const ITERATING_LAMBDA =
  /\.\s*(?:forEach|forEachIndexed|map|mapNotNull|mapIndexed|flatMap|filter|filterNot|onEach|associate|associateBy|associateWith|sumOf|any|all|none|count|groupBy|partition)\s*(?:\([^()]*\))?\s*\{/g;
const IO_RECEIVER =
  /^(?:repo|repository|dao|jdbc|jdbcTemplate|restTemplate|client|webClient|httpClient|connection|statement|entityManager|gateway|api)$|(?:Repo|Repository|Dao|DAO|Client|Connection|Statement|EntityManager|Gateway|Api|API|Template)$/;
const IO_METHOD =
  /^(?:find|load|read|query|select|insert|update|delete|exists|count|execute|fetch|list|write)(?:[A-Z0-9_]|$)|^(?:get|send|post|put|patch|exchange|retrieve|save)$/;
const BATCH_METHODS = new Set([
  'saveAll',
  'saveAllAndFlush',
  'deleteAll',
  'deleteAllById',
  'deleteAllInBatch',
  'findAllById',
]);
const MEMBER_CALL = /\b([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*\(/g;
const FILE_CALL =
  /\b(?:File|Path|URL)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*\.\s*(?:readText|readLines|readBytes|writeText|writeBytes|appendText|forEachLine|useLines|bufferedReader|bufferedWriter|inputStream|outputStream|openStream|openConnection)\b|\bFiles\s*\.\s*(?!exists\b|notExists\b|isDirectory\b|isRegularFile\b|isReadable\b|isWritable\b|isExecutable\b|isSymbolicLink\b|isHidden\b|isSameFile\b)[a-z]\w*\s*\(/g;

export const CALL_MESSAGES = {
  LogStringConcatenation:
    'Pass values as placeholders (`log.info("user {}", user)`), or give a lambda logger the message (`logger.info { "user $user" }`), not a message built with a string template, `+` or `format`.',
  ShellCommand:
    'Run the program directly with an argument list (`ProcessBuilder("git", "log", ref)`), not through a shell with `-c`.',
  IoCallInLoop:
    'This calls a database, HTTP, file or repository API once per loop item (one query or request per item). Batch it: fetch or write all items at once (`findAllById`, `saveAll`, `deleteAll`, `WHERE id IN (...)`, one batched request). Paging, polling and retry loops are fine.',
};

function builtMessage(scanned, argument) {
  const text = scanned.code.slice(argument.start, argument.end);
  const literals = literalsIn(scanned, argument.start, argument.end);
  if (literals.length === 0) {
    return false;
  }
  return (
    literals.some(({ template }) => template) || FORMATTED.test(text) || CONCATENATED.test(text)
  );
}

function messageOf(call) {
  return call.method === 'log' && call.arguments.length > 1 ? call.arguments[1] : call.arguments[0];
}

export function logTemplates(scanned) {
  return logCalls(scanned.code).flatMap((call) => {
    const message = messageOf(call);
    return message !== undefined && builtMessage(scanned, message)
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

function loopBodies(code) {
  const loops = [...code.matchAll(LOOP_HEADER)].flatMap((match) => {
    const headerOpen = code.indexOf('(', match.index);
    const headerClose = closingIndex(code, headerOpen);
    const brace = /^\s*\{/.exec(code.slice(headerClose + 1));
    if (brace === null) {
      return [];
    }
    const open = headerClose + brace[0].length;
    const variables = (match[1] ?? match[2] ?? '').split(',').map((name) => name.trim());
    return [{ open, close: closingIndex(code, open), variables }];
  });
  const doLoops = [...code.matchAll(DO_LOOP)].map((match) => {
    const open = match.index + match[0].length - 1;
    return { open, close: closingIndex(code, open), variables: [] };
  });
  const lambdas = [...code.matchAll(ITERATING_LAMBDA)].map((match) => {
    const open = match.index + match[0].length - 1;
    const parameters = /^\{\s*([\w\s,()]+?)\s*->/.exec(code.slice(open));
    const variables = parameters === null ? ['it'] : parameters[1].split(/[\s,()]+/);
    return { open, close: closingIndex(code, open), variables };
  });
  return [...loops, ...doLoops, ...lambdas];
}

function ioCalls(code, loop) {
  const body = code.slice(loop.open, loop.close);
  const members = [...body.matchAll(MEMBER_CALL)].filter(([, receiver, method]) => {
    const looksLikeIo =
      IO_RECEIVER.test(receiver) &&
      IO_METHOD.test(method) &&
      !BATCH_METHODS.has(method) &&
      !(/^(?:is|has|get)[A-Z]/.test(method) && !/^get(?:By|All|One|Reference|For)/.test(method));
    return looksLikeIo && !loop.variables.includes(receiver);
  });
  return [...members, ...body.matchAll(FILE_CALL)].map(({ index }) => loop.open + index);
}

export function ioInLoops(scanned) {
  const offsets = new Set(loopBodies(scanned.code).flatMap((loop) => ioCalls(scanned.code, loop)));
  return [...offsets]
    .toSorted((left, right) => left - right)
    .map((offset) => ({
      rule: 'IoCallInLoop',
      offset,
    }));
}
