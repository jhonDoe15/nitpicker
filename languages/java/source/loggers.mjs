import { closingIndex } from './brackets.mjs';

const LEVELS = [
  'trace',
  'debug',
  'info',
  'warn',
  'warning',
  'error',
  'fatal',
  'severe',
  'fine',
  'finer',
  'finest',
  'config',
  'log',
  'atTrace',
  'atDebug',
  'atInfo',
  'atWarn',
  'atError',
  'v',
  'd',
  'i',
  'w',
  'e',
  'wtf',
];
const FAILURE_LEVELS = new Set([
  'warn',
  'warning',
  'error',
  'fatal',
  'severe',
  'atWarn',
  'atError',
  'w',
  'e',
  'wtf',
]);
const FAILURE_LEVEL_ARGUMENT = /\bLevel\.(?:SEVERE|WARNING|WARN|ERROR|FATAL)\b/;

const LOGGER_FACTORIES = [
  'KotlinLogging.logger',
  'LoggerFactory.getLogger',
  'LogManager.getLogger',
  'LogManager.getFormatterLogger',
  'Logger.getLogger',
  'System.getLogger',
  'getLogger',
];

const FACTORY_CALL = LOGGER_FACTORIES.map((factory) =>
  factory.replaceAll('.', String.raw`\.`),
).join('|');
const DECLARATION = new RegExp(
  String.raw`\b(\w+)\s*(?::[^=\n;]+?)?=\s*(?:[\w.]+\.)?(?:${FACTORY_CALL})\b`,
  'g',
);
const LOGGER_NAMES = [/^(?:log|logger)$/i, /[a-z0-9](?:Log|Logger)$/, /_(?:log|logger)$/i];
const CALL = new RegExp(String.raw`\b(\w+)\s*\??\.\s*(${LEVELS.join('|')})\s*(?=[({])`, 'g');
const CHAIN = /(?:\s*\??\.\s*\w+\s*\((?:[^()]|\([^()]*\))*\))*/y;
const OPENERS = { '(': ')', '{': '}', '[': ']' };
const CLOSERS = new Set(Object.values(OPENERS));

export function loggerNames(code) {
  return new Set([...code.matchAll(DECLARATION)].map((match) => match[1]));
}

function isLoggerName(name, declared) {
  return declared.has(name) || LOGGER_NAMES.some((pattern) => pattern.test(name));
}

export function topLevelArguments(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (const [index, character] of [...text].entries()) {
    if (character in OPENERS) {
      depth += 1;
    } else if (CLOSERS.has(character)) {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, text.slice(start)].map((part) => part.trim()).filter(Boolean);
}

function chainEnd(code, end) {
  CHAIN.lastIndex = end + 1;
  return end + CHAIN.exec(code)[0].length;
}

function callAt(code, match) {
  const open = match.index + match[0].length;
  const close = closingIndex(code, open);
  if (close === -1) {
    return undefined;
  }
  const lambdaLength =
    code[open] === '(' ? /^\s*\{/.exec(code.slice(close + 1))?.[0].length : undefined;
  const lambdaOpen = code[open] === '{' ? open : close + (lambdaLength ?? 0);
  const lambdaEnd = lambdaLength === undefined ? close : closingIndex(code, lambdaOpen);
  const lambda =
    code[lambdaOpen] === '{' && lambdaEnd !== -1
      ? { open: lambdaOpen, close: lambdaEnd }
      : undefined;
  return {
    index: match.index,
    receiver: match[1],
    level: match[2],
    open,
    close,
    lambda,
    args: code[open] === '(' ? topLevelArguments(code.slice(open + 1, close)) : [],
    text: code.slice(match.index, chainEnd(code, lambdaEnd === -1 ? close : lambdaEnd) + 1),
  };
}

export function isFailureCall({ level, args }) {
  return level === 'log' ? FAILURE_LEVEL_ARGUMENT.test(args[0] ?? '') : FAILURE_LEVELS.has(level);
}

export function logCalls(code) {
  const declared = loggerNames(code);
  return [...code.matchAll(CALL)]
    .filter((match) => isLoggerName(match[1], declared))
    .flatMap((match) => {
      const call = callAt(code, match);
      return call === undefined ? [] : [call];
    });
}
