import { maskKotlinSource } from '../adapters/kotlin/rules/kotlin-literals.mjs';
import { closingIndex } from './brackets.mjs';
import { maskJavaSource } from './java-masking.mjs';

const TEST_ANNOTATION =
  /@(?:[\w.]+\.)?(?:Test|ParameterizedTest|RepeatedTest|TestTemplate)\b(\s*\((?:[^()]|\([^()]*\))*\))?/g;
const ANNOTATIONS = /^(?:\s*@[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?)*/;
const HEAD = /^([^{;(=]*)\(/;
const KOTLIN_NAME = /`([^`]+)`\s*$|(\w+)\s*$/;
const JAVA_NAME = /(\w+)\s*$/;
const AFTER_PARAMETERS = {
  java: /^\s*(?:throws[^{;]*)?([{])/,
  kotlin: /^\s*(?::[^={]*)?([{=])/,
};
const WRAPPER = /^\s*\w+(?:\s*\((?:[^()]|\([^()]*\))*\))?\s*\{/;

function maskedSource(text, language) {
  return language === 'kotlin' ? maskKotlinSource(text).code : maskJavaSource(text);
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

function nameOf(head, language) {
  if (language === 'kotlin') {
    const match = /\bfun\b/.test(head) ? KOTLIN_NAME.exec(head) : undefined;
    return match?.[1] ?? match?.[2];
  }
  return JAVA_NAME.exec(head)?.[1];
}

function methodAfter(code, annotationEnd, language) {
  const rest = code.slice(annotationEnd);
  const skipped = ANNOTATIONS.exec(rest)[0].length;
  const match = HEAD.exec(rest.slice(skipped));
  const name = match === null ? undefined : nameOf(match[1], language);
  if (name === undefined) {
    return undefined;
  }
  const open = annotationEnd + skipped + match[0].length - 1;
  const close = closingIndex(code, open);
  const body =
    close === -1
      ? undefined
      : bodyOf({ code, afterParameters: close + 1, indent: lineIndent(code, open), language });
  return body === undefined ? undefined : { name, body };
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
