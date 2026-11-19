import { maskKotlinSource } from '../adapters/kotlin/rules/kotlin-literals.mts';
import { closingIndex } from './brackets.mts';
import { maskJavaSource } from './java-masking.mts';

const TEST_ANNOTATION =
  /@(?:[\w.]+\.)?(?:Test|ParameterizedTest|RepeatedTest|TestTemplate)\b(\s*\((?:[^()]|\([^()]*\))*\))?/g;
const DISABLED = /@(?:[\w.]+\.)?(?:Disabled|Ignore)\b/;
const ANNOTATIONS = /(?:\s*@[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?)*/y;
const HEAD = /([^{};(=]*)\(/y;
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'synchronized', 'try', 'else']);
const KOTLIN_NAME = /`([^`]+)`\s*$|(\w+)\s*$/;
const JAVA_NAME = /(\w+)\s*$/;
const AFTER_PARAMETERS: Record<string, RegExp> = {
  java: /\s*(?:throws[^{;]*)?(\{)/y,
  kotlin: /\s*(?::[^={]*)?([{=])/y,
};
const WRAPPER = /^\s*\w+(?:\s*\((?:[^()]|\([^()]*\))*\))?\s*\{/;

export type TestMethod = { name: string; body: string };

function maskedSource(text: string, language: string): string {
  return language === 'kotlin' ? maskKotlinSource(text).code : maskJavaSource(text);
}

function lineIndent(code: string, index: number): number {
  const start = code.lastIndexOf('\n', index) + 1;
  return code.slice(start).search(/\S/);
}

function expressionEnd(code: string, from: number, indent: number): number {
  const lines = code.slice(from).split('\n');
  let offset = from + (lines[0] ?? '').length;
  for (const line of lines.slice(1)) {
    if (line.trim() !== '' && line.search(/\S/) <= indent) {
      return offset;
    }
    offset += line.length + 1;
  }
  return code.length;
}

function bodyOf({
  code,
  afterParameters,
  indent,
  language,
}: {
  code: string;
  afterParameters: number;
  indent: number;
  language: string;
}): string | undefined {
  const pattern = AFTER_PARAMETERS[language];
  if (pattern === undefined) {
    return undefined;
  }
  pattern.lastIndex = afterParameters;
  const match = pattern.exec(code);
  if (match === null) {
    return undefined;
  }
  const at = afterParameters + match[0].length - 1;
  if (match[1] === '=') {
    const expression = code.slice(at + 1, expressionEnd(code, at + 1, indent));
    return expression.replace(WRAPPER, '');
  }
  const close = closingIndex(code, at);
  return close === -1 ? undefined : code.slice(at + 1, close);
}

function nameOf(head: string, language: string): string | undefined {
  if (language === 'kotlin') {
    const match = /\bfun\b/.test(head) ? KOTLIN_NAME.exec(head) : undefined;
    return match?.[1] ?? match?.[2];
  }
  return JAVA_NAME.exec(head)?.[1];
}

type Method = { name: string; body: string; open: number };

function methodAfter(code: string, from: number, language: string): Method | undefined {
  ANNOTATIONS.lastIndex = from;
  const skipped = ANNOTATIONS.exec(code)?.[0].length ?? 0;
  HEAD.lastIndex = from + skipped;
  const match = HEAD.exec(code);
  const name = match === null ? undefined : nameOf(match[1] ?? '', language);
  if (match === null) {
    return undefined;
  }
  if (name === undefined || KEYWORDS.has(name)) {
    return undefined;
  }
  const open = from + skipped + match[0].length - 1;
  const close = closingIndex(code, open);
  const body =
    close === -1
      ? undefined
      : bodyOf({ code, afterParameters: close + 1, indent: lineIndent(code, open), language });
  return body === undefined ? undefined : { name, body, open };
}

function isDisabled(code: string, annotationAt: number, open: number): boolean {
  const boundary = Math.max(
    code.lastIndexOf(';', annotationAt),
    code.lastIndexOf('{', annotationAt),
    code.lastIndexOf('}', annotationAt),
  );
  return DISABLED.test(code.slice(boundary + 1, open));
}

export function testMethods(text: string, language: string): TestMethod[] {
  const code = maskedSource(text, language);
  return [...code.matchAll(TEST_ANNOTATION)]
    .filter((match) => !/\bexpected\b/.test(match[1] ?? ''))
    .flatMap((match) => {
      const method = methodAfter(code, match.index + match[0].length, language);
      return method === undefined || isDisabled(code, match.index, method.open)
        ? []
        : [{ name: method.name, body: method.body }];
    });
}

export function definedFunctions(text: string, language: string): TestMethod[] {
  const code = maskedSource(text, language);
  const starts =
    language === 'kotlin'
      ? [...code.matchAll(/\bfun\b/g)].map((match) => match.index)
      : [0, ...[...code.matchAll(/[;{}]/g)].map((match) => match.index + 1)];
  const found = new Map<number, TestMethod>();
  for (const start of starts) {
    const method = methodAfter(code, start, language);
    if (method !== undefined) {
      found.set(method.open, { name: method.name, body: method.body });
    }
  }
  return [...found.values()];
}
