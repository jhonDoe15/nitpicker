export function formatSeconds(elapsedMs) {
  return `${(elapsedMs / 1000).toFixed(3)}s`;
}

export function sumToolCount(tools, property) {
  return tools.reduce((total, tool) => total + tool[property], 0);
}

export function singleLine(value) {
  return String(value).replaceAll(/\s+/g, ' ').trim();
}

const ESCAPE = String.fromCodePoint(0x1b);
const BELL = String.fromCodePoint(0x07);
const CSI_8BIT = String.fromCodePoint(0x9b);
const ESCAPE_SEQUENCES = new RegExp(
  [
    `(?:${ESCAPE}\\[|${CSI_8BIT})[0-?]*[ -/]*[@-~]`,
    `${ESCAPE}\\][^${BELL}${ESCAPE}]*(?:${BELL}|${ESCAPE}\\\\)?`,
    `${ESCAPE}[ -~]?`,
  ].join('|'),
  'gu',
);

export function printable(value) {
  return singleLine(String(value).replaceAll(ESCAPE_SEQUENCES, '')).replaceAll(/\p{Cc}/gu, '');
}
