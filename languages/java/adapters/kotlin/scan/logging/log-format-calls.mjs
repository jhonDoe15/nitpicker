import { isLoggerName, loggerNames } from '../../../../source/loggers.mjs';
import { splitArguments } from '../kotlin-source.mjs';

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const JBOSS_PRINTF = new Set([...LEVELS.map((level) => `${level}f`), 'logf']);
const JBOSS_MESSAGE = new Set([...LEVELS.map((level) => `${level}v`), 'logv']);
const LOG4J_METHODS = new Set([...LEVELS, 'log']);
const JBOSS_IMPORT =
  /^[ \t]*import\s+(?:org\.jboss\.logging\.(?:Logger|BasicLogger|\*)|io\.quarkus\.logging\.(?:Log|\*))[ \t]*$/mu;
const JUL_IMPORT = /^[ \t]*import\s+java\.util\.logging\.(?:Level|\*)[ \t]*$/mu;
const LOG4J_IMPORT =
  /^[ \t]*import\s+org\.apache\.logging\.log4j\.(?:Logger|LogManager|Level|\*)[ \t]*$/mu;
const LOG4J_LEVEL_IMPORT = /^[ \t]*import\s+org\.apache\.logging\.log4j\.(?:Level|\*)[ \t]*$/mu;
const CALL = /(?<!\w)([A-Za-z_]\w*)\s*\??\.\s*([a-z]\w*)\s*\(/gu;
const FORMATTER_FACTORY = String.raw`(?:org\.apache\.logging\.log4j\.)?LogManager\s*\.\s*getFormatterLogger\s*\(`;
const FORMATTER = new RegExp(
  String.raw`\b(?:val|var)\s+([A-Za-z_]\w*)\b[^=\n]*=\s*${FORMATTER_FACTORY}`,
  'gu',
);
const JUL_LEVEL = /^(?:java\.util\.logging\.)?Level\.[A-Z]+$/u;
const LOG4J_LEVEL = /^(?:org\.apache\.logging\.log4j\.)?Level\.[A-Z]+$/u;
const JBOSS_LEVEL = /^(?:(?:org\.jboss\.logging\.)?Logger\.)?Level\.[A-Z]+$/u;
const MARKER =
  /^(?:MarkerManager\s*\.\s*getMarker\s*\(.*\)|(?:[A-Za-z_]\w*)?[mM]arker|MARKER|[A-Z_]*_MARKER)$/su;
export const IDENTIFIER = /^[A-Za-z_]\w*$/u;
const THROWABLE_CONSTRUCTOR = /^(?:[\w.]+\.)?[A-Z]\w*(?:Exception|Error|Throwable)\s*\(/u;
const THROWABLE_TYPE = /^(?:[\w.]+\.)?\w*(?:Exception|Error|Throwable)$/u;
const LOG4J_PREFIXES = [LOG4J_LEVEL, MARKER];
const LOG4J_PREFIX_LIMIT = 2;
const JUL_ARITY = { log: 3, logp: 5 };
const JUL_FORMAT = { log: 1, logp: 3 };
const FQCN_FORMAT = 3;

export function declaredTypes(code, name) {
  const typed = new RegExp(
    String.raw`(?<![\w.])${name}\s*:\s*([\w.]+)(?:<[^>]*>)?\??(?![\w.<])`,
    'gu',
  );
  return new Set([...code.matchAll(typed)].map(([, type]) => type));
}

export function soleType(code, name) {
  const typed = new RegExp(String.raw`(?<![\w.])${name}\s*:\s*([\w.]+)\??(?![\w.<])`, 'gu');
  const untyped = new RegExp(
    String.raw`\b(?:va[lr]\s+${name}\s*=|for\s*\(\s*${name}\s+in\b|${name}\s*->)`,
    'u',
  );
  const matches = [...code.matchAll(typed)];
  return matches.length === 1 && !untyped.test(code) ? matches[0][1] : undefined;
}

export function isThrowable(code, text) {
  if (THROWABLE_CONSTRUCTOR.test(text)) {
    return true;
  }
  if (!IDENTIFIER.test(text)) {
    return false;
  }
  const types = [...declaredTypes(code, text)];
  return types.length > 0 && types.every((type) => THROWABLE_TYPE.test(type));
}

function partText(scanned, part) {
  return scanned.source.slice(part.start, part.end).trim();
}

function throwableAt(code, texts, index) {
  return isThrowable(code, texts[index] ?? '');
}

function jbossFormat(code, method, texts) {
  if (!method.startsWith('log')) {
    return throwableAt(code, texts, 0) ? 1 : 0;
  }
  if (JBOSS_LEVEL.test(texts[0] ?? '')) {
    return throwableAt(code, texts, 1) ? 2 : 1;
  }
  return JBOSS_LEVEL.test(texts[1] ?? '') && throwableAt(code, texts, 2) ? FQCN_FORMAT : -1;
}

function log4jFormat(texts) {
  const leading = texts.slice(0, LOG4J_PREFIX_LIMIT);
  const index = leading.findIndex((text) => !LOG4J_PREFIXES.some((pattern) => pattern.test(text)));
  return index === -1 ? leading.length : index;
}

function apiOf(context, call) {
  const { receiver, method } = call;
  if ((JBOSS_PRINTF.has(method) || JBOSS_MESSAGE.has(method)) && context.jboss) {
    return { api: 'jboss', printf: JBOSS_PRINTF.has(method), formats: true };
  }
  if (method === 'printf' && context.log4j) {
    return { api: 'log4j', printf: true, formats: true };
  }
  if (LOG4J_METHODS.has(method) && context.formatters.has(receiver)) {
    return { api: 'log4j', printf: true, formats: false };
  }
  return context.jul && call.parts.length === JUL_ARITY[method] && JUL_LEVEL.test(call.texts[0])
    ? { api: 'jul', printf: false, formats: true }
    : undefined;
}

function formatIndex(scanned, entry, call) {
  if (entry.api === 'jul') {
    return JUL_FORMAT[call.method];
  }
  return entry.api === 'jboss'
    ? jbossFormat(scanned.code, call.method, call.texts)
    : log4jFormat(call.texts);
}

function fileContext(scanned) {
  const { code } = scanned;
  return {
    jboss: JBOSS_IMPORT.test(code),
    jul: JUL_IMPORT.test(code) && !LOG4J_LEVEL_IMPORT.test(code),
    log4j: LOG4J_IMPORT.test(code),
    formatters: new Set([...code.matchAll(FORMATTER)].map(([, name]) => name)),
    declared: loggerNames(code),
  };
}

export function formatCalls(scanned) {
  const context = fileContext(scanned);
  if (!context.jboss && !context.jul && !context.log4j) {
    return [];
  }
  return [...scanned.code.matchAll(CALL)].flatMap((match) => {
    const [, receiver, method] = match;
    if (!isLoggerName(receiver, context.declared) && !context.formatters.has(receiver)) {
      return [];
    }
    const { parts } = splitArguments(scanned.code, match.index + match[0].length - 1);
    const call = { receiver, method, parts, texts: parts.map((part) => partText(scanned, part)) };
    const entry = apiOf(context, call);
    const index = entry === undefined ? -1 : formatIndex(scanned, entry, call);
    if (index < 0 || parts[index] === undefined) {
      return [];
    }
    return [
      {
        ...entry,
        method,
        start: match.index,
        format: parts[index],
        rest: call.texts.slice(index + 1),
        restParts: parts.slice(index + 1),
      },
    ];
  });
}
