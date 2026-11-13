export const ANSI = {
  reset: '\u001B[0m',
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
};

export function style(value, codes, color) {
  return color ? `${codes.join('')}${value}${ANSI.reset}` : value;
}

export function pluralize(noun, count) {
  return count === 1 ? noun : `${noun}s`;
}
