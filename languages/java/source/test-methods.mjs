import { maskKotlinSource } from '../adapters/kotlin/rules/kotlin-literals.mjs';
import { maskJavaSource } from './java-masking.mjs';

const TEST_ANNOTATION =
  /@(?:[\w.]+\.)?(?:Test|ParameterizedTest|RepeatedTest|TestTemplate)\b(\s*\((?:[^()]|\([^()]*\))*\))?/g;
const JAVA_SIGNATURE = /^(?:\s*@[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?)*[^{;(]*?\b(\w+)\s*\(/;
const KOTLIN_SIGNATURE =
  /^(?:\s*@[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?)*[^{=(]*?\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(?:`([^`]+)`|(\w+))\s*\(/;
const AFTER_PARAMETERS = {
  java: /^\s*(?:throws[^{;]*)?([{])/,
  kotlin: /^\s*(?::[^={]*)?([{=])/,
};
const WRAPPER = /^\s*\w+\s*(?:\((?:[^()]|\([^()]*\))*\))?\s*\{/;
const OPENERS = { '(': ')', '{': '}', '[': ']' };
const CLOSERS = new Set(Object.values(OPENERS));

export function maskedSource(text, language) {
  return language === 'kotlin' ? maskKotlinSource(text).code : maskJavaSource(text);
}

function closingIndex(code, openAt) {
  let depth = 0;
  for (let index = openAt; index < code.length; index += 1) {
    if (code[index] in OPENERS) {
      depth += 1;
    } else if (CLOSERS.has(code[index])) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function lineIndent(code, index) {
  const start = code.lastIndexOf('\n', index) + 1;
  return code.slice(start).search(/\S/);
}

function expressionEnd(code, from, indent) {
  const lines = code.slice(from).split('\n');
  let offset = from + lines[0].length;
  for (const line of lines.slice(1)) {
    if (line.trim() !== '' && line.search(/\S/) <= indent) {
      return offset;
    }
    offset += line.length + 1;
  }
  return code.length;
}

function bodyOf({ code, afterParameters, indent, language }) {
  const match = AFTER_PARAMETERS[language].exec(code.slice(afterParameters));
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

function methodAfter(code, annotationEnd, language) {
  const signature = language === 'kotlin' ? KOTLIN_SIGNATURE : JAVA_SIGNATURE;
  const rest = code.slice(annotationEnd);
  const match = signature.exec(rest);
  if (match === null) {
    return undefined;
  }
  const open = annotationEnd + match[0].length - 1;
  const close = closingIndex(code, open);
  const body =
    close === -1
      ? undefined
      : bodyOf({ code, afterParameters: close + 1, indent: lineIndent(code, open), language });
  return body === undefined ? undefined : { name: match[1] ?? match[2], body };
}

export function testMethods(text, language) {
  const code = maskedSource(text, language);
  return [...code.matchAll(TEST_ANNOTATION)]
    .filter((match) => !/\bexpected\b/.test(match[1] ?? ''))
    .flatMap((match) => {
      const method = methodAfter(code, match.index + match[0].length, language);
      return method === undefined ? [] : [method];
    });
}
