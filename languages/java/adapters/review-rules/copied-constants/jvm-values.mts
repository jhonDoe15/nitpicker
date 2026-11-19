import type { Literal } from './constant-types.mts';

const HEX = /^0[xX]([\da-fA-F]+)[lLuU]*$/u;
const BINARY = /^0[bB]([01]+)[lLuU]*$/u;
const DECIMAL = /^(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)[lLfFdDuU]*$/u;
const NUMBER_START = /^\.?\d/u;
const JAVA_OCTAL = /^0([0-7]+)$/u;

function numberValue(text: string, kotlin: boolean): number | undefined {
  const plain = text.replaceAll('_', '');
  const octal = kotlin ? undefined : JAVA_OCTAL.exec(plain.replace(/[lL]$/u, ''));
  if (octal) {
    return Number.parseInt(octal[1] ?? '', 8);
  }
  const hex = HEX.exec(plain);
  if (hex) {
    return Number.parseInt(hex[1] ?? '', 16);
  }
  const binary = BINARY.exec(plain);
  if (binary) {
    return Number.parseInt(binary[1] ?? '', 2);
  }
  const decimal = DECIMAL.exec(plain);
  return decimal ? Number(decimal[1] ?? '') : undefined;
}

export function tokenValue(
  text: string,
  { negated, kotlin }: { negated: boolean; kotlin: boolean },
): Literal | undefined {
  if (text.startsWith('"')) {
    const isTemplate = kotlin && text.includes('$');
    const isPlain = !text.startsWith('"""') && text.length >= 2 && !isTemplate;
    return isPlain && !negated ? { kind: 'string', value: text.slice(1, -1) } : undefined;
  }
  if (!NUMBER_START.test(text)) {
    return undefined;
  }
  const value = numberValue(text, kotlin);
  return value === undefined ? undefined : { kind: 'number', value: negated ? -value : value };
}

export function initializerValue(
  texts: readonly string[],
  { kotlin }: { kotlin: boolean },
): Literal | undefined {
  const [first = '', second = ''] = texts;
  if (texts.length === 1) {
    return tokenValue(first, { negated: false, kotlin });
  }
  return texts.length === 2 && first === '-'
    ? tokenValue(second, { negated: true, kotlin })
    : undefined;
}
