import { inspect } from 'node:util';

const MAX_RECORDED_FAILING_TESTS = 50;
export const MAX_SHOWN_FAILING_TESTS = 10;
const MAX_VALUE_LENGTH = 200;

function shortValue(value) {
  const characters = Array.from(String(value).replaceAll(/\s+/gu, ' ').trim());
  const shown = characters.slice(0, MAX_VALUE_LENGTH).join('');
  return characters.length > MAX_VALUE_LENGTH ? `${shown}…` : shown;
}

export function formattedValue(value) {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  return inspect(value, { depth: 4, breakLength: Infinity, compact: true, sorted: true });
}

function locationOf({ file, line }) {
  if (file === undefined || file === '') {
    return '';
  }
  return line === undefined ? `${file} > ` : `${file}:${String(line)} > `;
}

function valueLines(message, { expected, received }) {
  if (expected === undefined || received === undefined) {
    return [];
  }
  const shownExpected = shortValue(expected);
  const shownReceived = shortValue(received);
  if (message.includes(shownExpected) && message.includes(shownReceived)) {
    return [];
  }
  return [`    expected: ${shownExpected}`, `    received: ${shownReceived}`];
}

function failingTestEntry(failure) {
  const message = shortValue(failure.message ?? '');
  return [
    `  ${locationOf(failure)}${failure.name}${message === '' ? '' : `: ${message}`}`,
    ...valueLines(message, failure),
  ];
}

export function failingTestEntries(failures) {
  const listed = failures.slice(0, MAX_RECORDED_FAILING_TESTS);
  const omitted = failures.length - listed.length;
  return [
    ...listed.flatMap((failure) => failingTestEntry(failure)),
    ...(omitted > 0 ? [`  and ${String(omitted)} more`] : []),
  ];
}

const VALUE_PAIRS = [
  /\bexpected:? ?<(?<expected>.*?)> but was:? ?<(?<received>.*?)>/su,
  /^\s*expected: (?<expected>.+)\n\s*but was: (?<received>.+)$/mu,
  /^\s*Expected: (?<expected>.+)\n\s*Received: (?<received>.+)$/mu,
  /^\s*Expected: (?<expected>.+)\n\s*but: (?<received>.+)$/mu,
  /\bExpected <(?<expected>.*?)>, actual <(?<received>.*?)>\./su,
  /^\s*expected\s*: (?<expected>.+)\n\s*actual\s*: (?<received>.+)$/mu,
  /^Expecting actual:\n *(?<received>\S.*)\nto be equal to:\n *(?<expected>\S.*)$/mu,
];

export function valuesInMessage(text) {
  for (const pattern of VALUE_PAIRS) {
    const match = pattern.exec(String(text ?? ''));
    if (match !== null) {
      return { expected: match.groups.expected, received: match.groups.received };
    }
  }
  return {};
}
