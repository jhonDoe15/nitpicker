const HEX = /^0[xX]([\da-fA-F]+)[lLuU]*$/u;
const BINARY = /^0[bB]([01]+)[lLuU]*$/u;
const DECIMAL = /^(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)[lLfFdDuU]*$/u;
const NUMBER_START = /^\.?\d/u;

function numberValue(text) {
  const plain = text.replaceAll('_', '');
  const hex = HEX.exec(plain);
  if (hex) {
    return Number.parseInt(hex[1], 16);
  }
  const binary = BINARY.exec(plain);
  if (binary) {
    return Number.parseInt(binary[1], 2);
  }
  const decimal = DECIMAL.exec(plain);
  return decimal ? Number(decimal[1]) : undefined;
}

/** The value of a JVM string or number token text, or undefined for any other token. */
export function tokenValue(text, { negated = false } = {}) {
  if (text.startsWith('"')) {
    const isPlain = !text.startsWith('"""') && text.length >= 2 && !text.includes('$');
    return isPlain && !negated ? { kind: 'string', value: text.slice(1, -1) } : undefined;
  }
  if (!NUMBER_START.test(text)) {
    return undefined;
  }
  const value = numberValue(text);
  return value === undefined ? undefined : { kind: 'number', value: negated ? -value : value };
}

/** The value of an initializer written as one literal token, optionally negated. */
export function initializerValue(texts) {
  if (texts.length === 1) {
    return tokenValue(texts[0]);
  }
  return texts.length === 2 && texts[0] === '-'
    ? tokenValue(texts[1], { negated: true })
    : undefined;
}
