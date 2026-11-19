import {
  closingIndex,
  lineAt,
  stringLiterals,
  topLevelParts,
} from './classes/source-structure.mts';
import { escapeRegExp, largest } from '../typed/shared-views.mts';
import type {
  ArgumentsText,
  AttributeValue,
  KeyAt,
  SourceText,
  UnboundSource,
} from '../typed/unbound-types.mts';

const TEST_ANNOTATION = /@(?:[\w.]*\.)?(\w*Test|TestPropertySource)\s*\(/gu;
const CALL = /(?:\bTestPropertyValues\s*\.\s*of|\bwithPropertyValues|\.\s*and)\s*\(/gu;
const JAVA_REGISTRY = /\bDynamicPropertyRegistry\s+(\w+)/gu;
const KOTLIN_REGISTRY = /\b(\w+)\s*:\s*DynamicPropertyRegistry\b/gu;
const ATTRIBUTE = /^\s*(\w+)\s*=\s*/u;
const PAIR_KEY = /^\s*([^=:\s]+)/u;
const QUOTED = /"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"/gu;

function quotedOnly(text: string): string {
  return text.replaceAll(QUOTED, (literal) => {
    const quote = literal.startsWith('"""') ? '"""' : '"';
    const inside = literal.slice(quote.length, -quote.length).replaceAll(/[^\n]/gu, ' ');
    return `${quote}${inside}${quote}`;
  });
}

function argumentsAt({ text, code }: SourceText, open: number): ArgumentsText {
  const close = closingIndex(code, open);
  const inside = text.slice(open + 1, close);
  return { start: open + 1, text: inside, code: quotedOnly(inside) };
}

function attributeValues(argumentsText: ArgumentsText, annotation: string): AttributeValue[] {
  const parts = topLevelParts(argumentsText.code, [','], { angles: false });
  const [first] = parts;
  const positional = first !== undefined && !ATTRIBUTE.test(first.text);
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

function pairKeys(source: SourceText, { start, text }: AttributeValue): KeyAt[] {
  return stringLiterals(text)
    .filter((literal) => !literal.continued)
    .map((literal) => ({ key: PAIR_KEY.exec(literal.value)?.[1], offset: start + literal.offset }))
    .filter(
      (found): found is { key: string; offset: number } =>
        found.key !== undefined && !found.key.includes('$'),
    )
    .map(({ key, offset }) => ({ key, line: lineAt(source.text, offset) }));
}

function annotationKeys(source: SourceText): KeyAt[] {
  return [...source.code.matchAll(TEST_ANNOTATION)].flatMap((match) => {
    const annotation = match[1] ?? '';
    const isOverride = annotation === 'TestPropertySource' || /Test$/u.test(annotation);
    return isOverride
      ? attributeValues(argumentsAt(source, match.index + match[0].length - 1), annotation).flatMap(
          (value) => pairKeys(source, value),
        )
      : [];
  });
}

function isPropertyCall(code: string, match: RegExpExecArray): boolean {
  if (!match[0].startsWith('.')) {
    return true;
  }
  const before = code.slice(0, match.index);
  const start = largest([';', '{', '}'].map((end) => before.lastIndexOf(end)));
  const statement = before.slice(start + 1);
  return /\b(?:TestPropertyValues|withPropertyValues)\b/u.test(statement);
}

function callKeys(source: SourceText): KeyAt[] {
  return [...source.code.matchAll(CALL)]
    .filter((match) => isPropertyCall(source.code, match))
    .flatMap((match) => pairKeys(source, argumentsAt(source, match.index + match[0].length - 1)));
}

function registryKeys(source: UnboundSource): KeyAt[] {
  const names = [...source.code.matchAll(source.kotlin ? KOTLIN_REGISTRY : JAVA_REGISTRY)].map(
    ([, name = '']) => name,
  );
  return [...new Set(names)].flatMap((name) =>
    [
      ...source.text.matchAll(
        new RegExp(String.raw`\b${escapeRegExp(name)}\s*\.\s*add\s*\(\s*"([^"$]+)"`, 'gu'),
      ),
    ].map((match) => ({
      key: match[1] ?? '',
      line: lineAt(source.text, match.index),
    })),
  );
}

export function testOverrideKeys(source: UnboundSource): KeyAt[] {
  return [...annotationKeys(source), ...callKeys(source), ...registryKeys(source)];
}
