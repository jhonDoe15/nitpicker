export const JVM_SOURCE = /\.(java|kt|groovy|scala)$/u;

const NAME_PART = String.raw`(?:\x60[^\x60]+\x60|[\p{L}_$][\p{L}\p{N}_$]*)`;
const QUALIFIED_NAME = new RegExp(String.raw`${NAME_PART}(?:\s*\.\s*${NAME_PART})*`, 'uy');
const PACKAGE_KEYWORD = /package(?=\s)/uy;
const PACKAGE_OBJECT = /object(?![\w$])/uy;
const ANNOTATION_NAME = /@[\w$.:`]+/uy;
const TRIVIA = /(?:\s|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))*/uy;
const ARGUMENT_TOKEN =
  /"""[\s\S]*?(?:"""|$)|"(?:[^"\\]|\\[\s\S])*"?|'(?:[^'\\]|\\[\s\S])*'?|[^()"']+|[()]/gu;
const BYTE_ORDER_MARK = '﻿';
const BRACE = '{';
const UNKNOWN = Symbol('unknown');

function sticky(pattern, text, at) {
  pattern.lastIndex = at;
  return pattern.exec(text);
}

function skipTrivia(text, at) {
  return at + sticky(TRIVIA, text, at)[0].length;
}

function argumentsEnd(text, from) {
  let depth = 0;
  for (const token of text.slice(from).matchAll(ARGUMENT_TOKEN)) {
    depth += token[0] === '(' ? 1 : 0;
    depth -= token[0] === ')' ? 1 : 0;
    if (depth === 0) {
      return from + token.index + token[0].length;
    }
  }
  return text.length;
}

function skipAnnotation(text, at) {
  const name = sticky(ANNOTATION_NAME, text, at);
  if (name === null || name[0] === '@interface') {
    return undefined;
  }
  const next = skipTrivia(text, at + name[0].length);
  return text[next] === '(' ? argumentsEnd(text, next) : at + name[0].length;
}

function packageClause(text, at) {
  if (sticky(PACKAGE_KEYWORD, text, at) === null) {
    return undefined;
  }
  const start = skipTrivia(text, at + 'package'.length);
  const name = sticky(QUALIFIED_NAME, text, start);
  if (name === null || sticky(PACKAGE_OBJECT, text, start) !== null) {
    return undefined;
  }
  const end = start + name[0].length;
  return {
    name: name[0].replaceAll(/[\s`]/gu, ''),
    end,
    braced: text[skipTrivia(text, end)] === BRACE,
  };
}

function stepAt(text, at) {
  const clause = packageClause(text, at);
  if (clause !== undefined) {
    return clause.braced ? UNKNOWN : clause;
  }
  if (text[at] === ';') {
    return { end: at + 1 };
  }
  const end = text[at] === '@' ? skipAnnotation(text, at) : undefined;
  return end === undefined ? undefined : { end };
}

function collect(text, start) {
  const names = [];
  const pending = [start];
  for (const at of pending) {
    const step = stepAt(text, skipTrivia(text, at));
    if (step === UNKNOWN) {
      return undefined;
    }
    if (step !== undefined) {
      names.push(...(step.name === undefined ? [] : [step.name]));
      pending.push(step.end);
    }
  }
  return names;
}

export function declaredPackage(text) {
  if (typeof text !== 'string' || text.includes('\0') || text.includes('�')) {
    return undefined;
  }
  return collect(text, text.startsWith(BYTE_ORDER_MARK) ? 1 : 0)?.join('.');
}
