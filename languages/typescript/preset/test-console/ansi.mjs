const ESCAPE_CHARACTER = String.fromCodePoint(0x1b);

const ANSI_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-9;]*m`, 'gu');

export function stripAnsi(text) {
  return text.replaceAll(ANSI_PATTERN, '');
}
