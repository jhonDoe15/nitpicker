import { closingIndex } from './brackets.mjs';

const LOG_LEVELS = [
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
];

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
const LOGGER_NAME = new RegExp(
  [
    '^(?:[a-z][a-z0-9]*)?Logger$',
    '^(?:[a-z][a-z0-9]*)?Log$',
    String.raw`^(?:log|logger)\w*$`,
    '^[A-Z][A-Z0-9_]*LOG(?:GER)?$',
    String.raw`^LOG(?:GER)?\w*$`,
  ].join('|'),
);
const CALL = new RegExp(String.raw`\b(\w+)\s*\.\s*(${LOG_LEVELS.join('|')})\s*(?=[({])`, 'g');
const OPENERS = { '(': ')', '{': '}', '[': ']' };
const CLOSERS = new Set(Object.values(OPENERS));

export function loggerNames(code) {
  return new Set([...code.matchAll(DECLARATION)].map((match) => match[1]));
}

function isLoggerName(name, declared) {
  return declared.has(name) || LOGGER_NAME.test(name);
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

function callAt(code, match) {
  const open = match.index + match[0].length;
  const close = closingIndex(code, open);
  if (close === -1) {
    return undefined;
  }
  const lambdaLength =
    code[open] === '(' ? /^\s*\{/.exec(code.slice(close + 1))?.[0].length : undefined;
  const end = lambdaLength === undefined ? close : closingIndex(code, close + lambdaLength);
  return {
    index: match.index,
    receiver: match[1],
    level: match[2],
    args: code[open] === '(' ? topLevelArguments(code.slice(open + 1, close)) : [],
    text: code.slice(match.index, end === -1 ? close + 1 : end + 1),
  };
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
