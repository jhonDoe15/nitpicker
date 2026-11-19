import { closingIndex } from './brackets.mts';
import { topLevelParts } from './frames/bracket-depths.mts';

export const LOG_LEVELS = [
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
export const LOGGER_NAME_PATTERNS = [
  /^(?:log|logger)$/i,
  /[a-z0-9](?:Log|Logger)$/,
  /_(?:log|logger)$/i,
];
const CALL = new RegExp(String.raw`\b(\w+)\s*\??\.\s*(${LOG_LEVELS.join('|')})\s*(?=[({])`, 'g');
export type LogCall = {
  index: number;
  receiver: string;
  level: string;
  open: number;
  close: number;
  lambda: { open: number; close: number } | undefined;
  args: string[];
  text: string;
};

const CHAIN = /(?:\s*\??\.\s*\w+\s*\((?:[^()]|\([^()]*\))*\))*/y;

export function loggerNames(code: string): Set<string> {
  return new Set(
    [...code.matchAll(DECLARATION)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])),
  );
}

export function isLoggerName(name: string, declared: Set<string> = new Set()): boolean {
  return declared.has(name) || LOGGER_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

export function topLevelArguments(text: string): string[] {
  return topLevelParts(text, { openers: '({[', closers: ')}]' });
}

function chainEnd(code: string, end: number): number {
  CHAIN.lastIndex = end + 1;
  return end + (CHAIN.exec(code)?.[0].length ?? 0);
}

function callAt(code: string, match: RegExpExecArray): LogCall | undefined {
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
    receiver: match[1] ?? '',
    level: match[2] ?? '',
    open,
    close,
    lambda,
    args: code[open] === '(' ? topLevelArguments(code.slice(open + 1, close)) : [],
    text: code.slice(match.index, chainEnd(code, lambdaEnd === -1 ? close : lambdaEnd) + 1),
  };
}

export function isFailureCall({ level, args }: Pick<LogCall, 'level' | 'args'>): boolean {
  return level === 'log' ? FAILURE_LEVEL_ARGUMENT.test(args[0] ?? '') : FAILURE_LEVELS.has(level);
}

export function logCalls(code: string): LogCall[] {
  const declared = loggerNames(code);
  return [...code.matchAll(CALL)]
    .filter((match) => isLoggerName(match[1] ?? '', declared))
    .flatMap((match) => {
      const call = callAt(code, match);
      return call === undefined ? [] : [call];
    });
}
