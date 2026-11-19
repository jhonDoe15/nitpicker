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

type Step = { readonly name?: string; readonly end: number; readonly braced?: true };

function sticky(pattern: RegExp, text: string, at: number): RegExpExecArray | undefined {
  pattern.lastIndex = at;
  return pattern.exec(text) ?? undefined;
}

function skipTrivia(text: string, at: number): number {
  return at + (sticky(TRIVIA, text, at)?.[0].length ?? 0);
}

function argumentsEnd(text: string, from: number): number {
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

function skipAnnotation(text: string, at: number): number | undefined {
  const name = sticky(ANNOTATION_NAME, text, at);
  if (name === undefined || name[0] === '@interface') {
    return undefined;
  }
  const next = skipTrivia(text, at + name[0].length);
  return text[next] === '(' ? argumentsEnd(text, next) : at + name[0].length;
}

function packageClause(text: string, at: number): (Step & { readonly name: string }) | undefined {
  if (sticky(PACKAGE_KEYWORD, text, at) === undefined) {
    return undefined;
  }
  const start = skipTrivia(text, at + 'package'.length);
  const name = sticky(QUALIFIED_NAME, text, start);
  if (name === undefined || sticky(PACKAGE_OBJECT, text, start) !== undefined) {
    return undefined;
  }
  const end = start + name[0].length;
  return {
    name: name[0].replaceAll(/[\s`]/gu, ''),
    end,
    ...(text[skipTrivia(text, end)] === BRACE ? { braced: true } : {}),
  };
}

function stepAt(text: string, at: number): Step | typeof UNKNOWN | undefined {
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

function collect(text: string, start: number): string[] | undefined {
  const names: string[] = [];
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

export function declaredPackage(text: string | undefined): string | undefined {
  if (typeof text !== 'string' || text.includes('\0') || text.includes('�')) {
    return undefined;
  }
  return collect(text, text.startsWith(BYTE_ORDER_MARK) ? 1 : 0)?.join('.');
}
