import {
  closingIndex,
  lineAt,
  stringLiterals,
  topLevelParts,
} from './classes/source-structure.mjs';

const TEST_ANNOTATION = /@(?:[\w.]*\.)?(\w*Test|TestPropertySource)\s*\(/gu;
const CALL = /(?:\bTestPropertyValues\s*\.\s*of|\bwithPropertyValues|\.\s*and)\s*\(/gu;
const JAVA_REGISTRY = /\bDynamicPropertyRegistry\s+(\w+)/gu;
const KOTLIN_REGISTRY = /\b(\w+)\s*:\s*DynamicPropertyRegistry\b/gu;
const ATTRIBUTE = /^\s*(\w+)\s*=\s*/u;
const PAIR_KEY = /^\s*([^=:\s]+)/u;
const QUOTED = /"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"/gu;

function quotedOnly(text) {
  return text.replaceAll(QUOTED, (literal) => {
    const quote = literal.startsWith('"""') ? '"""' : '"';
    const inside = literal.slice(quote.length, -quote.length).replaceAll(/[^\n]/gu, ' ');
    return `${quote}${inside}${quote}`;
  });
}

function argumentsAt({ text, code }, open) {
  const close = closingIndex(code, open);
  const inside = text.slice(open + 1, close);
  return { start: open + 1, text: inside, code: quotedOnly(inside) };
}

function attributeValues(argumentsText, annotation) {
  const parts = topLevelParts(argumentsText.code, [','], { angles: false });
  const positional = parts.length > 0 && !ATTRIBUTE.test(parts[0].text);
  return parts.flatMap((part) => {
    const name = ATTRIBUTE.exec(part.text)?.[1];
    const isProperties =
      name === 'properties' ||
      (annotation === 'SpringBootTest' && (name === 'value' || (positional && name === undefined)));
    return isProperties
      ? [
          {
            start: argumentsText.start + part.start,
            text: argumentsText.text.slice(part.start, part.start + part.text.length),
          },
        ]
      : [];
  });
}

function pairKeys(source, { start, text }) {
  return stringLiterals(text)
    .filter((literal) => !literal.continued)
    .map((literal) => ({ key: PAIR_KEY.exec(literal.value)?.[1], offset: start + literal.offset }))
    .filter(({ key }) => key !== undefined && !key.includes('$'))
    .map(({ key, offset }) => ({ key, line: lineAt(source.text, offset) }));
}

function annotationKeys(source) {
  return [...source.code.matchAll(TEST_ANNOTATION)].flatMap((match) => {
    const annotation = match[1];
    const isOverride = annotation === 'TestPropertySource' || /Test$/u.test(annotation);
    return isOverride
      ? attributeValues(argumentsAt(source, match.index + match[0].length - 1), annotation).flatMap(
          (value) => pairKeys(source, value),
        )
      : [];
  });
}

function isPropertyCall(code, match) {
  if (!match[0].startsWith('.')) {
    return true;
  }
  const before = code.slice(0, match.index);
  const start = Math.max(...[';', '{', '}'].map((end) => before.lastIndexOf(end)));
  const statement = before.slice(start + 1);
  return /\b(?:TestPropertyValues|withPropertyValues)\b/u.test(statement);
}

function callKeys(source) {
  return [...source.code.matchAll(CALL)]
    .filter((match) => isPropertyCall(source.code, match))
    .flatMap((match) => pairKeys(source, argumentsAt(source, match.index + match[0].length - 1)));
}

function registryKeys(source) {
  const names = [...source.code.matchAll(source.kotlin ? KOTLIN_REGISTRY : JAVA_REGISTRY)].map(
    ([, name]) => name,
  );
  return [...new Set(names)].flatMap((name) =>
    [
      ...source.text.matchAll(new RegExp(String.raw`\b${name}\s*\.\s*add\s*\(\s*"([^"$]+)"`, 'gu')),
    ].map((match) => ({
      key: match[1],
      line: lineAt(source.text, match.index),
    })),
  );
}

export function testOverrideKeys(source) {
  return [...annotationKeys(source), ...callKeys(source), ...registryKeys(source)];
}
