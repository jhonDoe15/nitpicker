import { stripAnsi } from './ansi.mjs';

const ABSOLUTE_PATH_PATTERN =
  /(?<![\w/:.\\-])(?:<(?:root|tmp|home)>)?(?:file:\/\/)?(?:[A-Za-z]:)?(?:[\\/][\w.@+~$%-]+)+/gu;

const TIMESTAMP_PATTERN =
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/gu;

const CONTROL_ENTITY_PATTERN =
  /&(?:amp;)?#(?:[xX]0*(?:[01]?[0-9a-fA-F]|7[fF])|0*(?:[0-9]|[12][0-9]|3[01]|127));/gu;

const CONTROL_RANGES = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x7f],
];

function characterRange([first, last]) {
  return `${String.fromCodePoint(first)}-${String.fromCodePoint(last)}`;
}

const CONTROL_CHARACTER_PATTERN = new RegExp(
  `[${CONTROL_RANGES.map(characterRange).join('')}]|\\p{Cs}`,
  'gu',
);

const REPLACED_CHARACTER_PATTERN = /(?<=[\p{L}\p{N}])\?(?=[\p{L}\p{N}])/gu;

const LOGGER_CLOCK_PATTERN = /\b[A-Z][a-z]{2} \d{1,2}, \d{4},? \d{1,2}:\d{2}:\d{2}\s?(?:AM|PM)\b/gu;

const CLOCK_PATTERN = /\b\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?(?:\s?(?:AM|PM)\b)?/gu;

const ISO_DURATION_PATTERN =
  /\bP(?:(?:\d+[YMWD])+(?:T(?:\d+(?:[.,]\d+)?[HMS])+)?|T(?:\d+(?:[.,]\d+)?[HMS])+)(?![A-Za-z0-9])/gu;

const COMPOUND_DURATION_PATTERN =
  /(?<![A-Za-z0-9.])(?:\d+(?:\.\d+)?(?:ms|[dhms])){2,}(?![A-Za-z0-9])/gu;

const GENERATED_CLASS_NUMBER_PATTERN = /(\$\$[A-Za-z]+\$\$)\d+(?![A-Za-z0-9])/gu;

const GENERATED_CLASS_ID_PATTERN =
  /(\$(?:MockitoMock|ByteBuddy)\$|\$\$[A-Za-z]+\$\$)[A-Za-z0-9]+/gu;

const COUNTER_PATTERN = /(?<![A-Za-z0-9_$./-])([a-z]{3,})\d+(?![A-Za-z0-9])/gu;

const HEX_PATTERN = /\b0x[0-9a-fA-F]+\b/gu;

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;

const IDENTIFIER_PATTERN =
  /(?<![A-Za-z0-9])(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z0-9]{6,}(?![A-Za-z0-9])/gu;

const NUMBER_PATTERN =
  /(?<![A-Za-z_$])\d+(?:[.,]\d+)*(?:%|\s?(?:ms|s|sec|secs|seconds?|min|minutes?|hours?|[kmg]i?b|bytes?)\b)?/giu;

const TEMPORARY_NAME_PATTERN =
  /(?<![A-Za-z0-9_])tmp(?:[a-z0-9_]{6,}|[.-][A-Za-z0-9]{6,})(?![A-Za-z0-9_])/gu;

const TEMPORARY_DIRECTORY_PATTERN = /^(?:<tmp>|\/(?:var\/)?tmp)(?:[\\/]|$)/u;

const RANDOM_SUFFIX_NAME_PATTERN =
  /^(?:[\w.@+~$%-]*[-_.][A-Za-z0-9]{6}|(?=[a-z]*[A-Z0-9])[A-Za-z0-9]{6})$/u;

const PLACEHOLDER_PATTERN = /<(?:time|duration|hex|uuid|id|n|root|tmp|home)>/gu;

const MIN_SPECIFIC_CHARACTERS = 3;

const MAX_MESSAGE_LENGTH = 300;

function lastSegment(match) {
  const name = match.split(/[\\/]/u).at(-1);
  return TEMPORARY_DIRECTORY_PATTERN.test(match) && RANDOM_SUFFIX_NAME_PATTERN.test(name)
    ? '<id>'
    : name;
}

function withoutBuildEscapes(line) {
  return stripAnsi(line)
    .replaceAll(CONTROL_ENTITY_PATTERN, '')
    .replaceAll(CONTROL_CHARACTER_PATTERN, '')
    .replaceAll(REPLACED_CHARACTER_PATTERN, '');
}

function withTimePlaceholders(line) {
  return line
    .replaceAll(TIMESTAMP_PATTERN, '<time>')
    .replaceAll(LOGGER_CLOCK_PATTERN, '<time>')
    .replaceAll(CLOCK_PATTERN, '<time>')
    .replaceAll(ISO_DURATION_PATTERN, '<duration>')
    .replaceAll(COMPOUND_DURATION_PATTERN, '<duration>');
}

export function normalizeConsoleMessage(line) {
  return withTimePlaceholders(
    withoutBuildEscapes(line)
      .replaceAll(ABSOLUTE_PATH_PATTERN, lastSegment)
      .replaceAll(TEMPORARY_NAME_PATTERN, '<id>'),
  )
    .replaceAll(GENERATED_CLASS_NUMBER_PATTERN, '$1<n>')
    .replaceAll(GENERATED_CLASS_ID_PATTERN, '$1<id>')
    .replaceAll(HEX_PATTERN, '<hex>')
    .replaceAll(UUID_PATTERN, '<uuid>')
    .replaceAll(COUNTER_PATTERN, '$1<n>')
    .replaceAll(IDENTIFIER_PATTERN, '<id>')
    .replaceAll(NUMBER_PATTERN, '<n>')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

export function hasSpecificText(text) {
  const remaining = normalizeConsoleMessage(text)
    .replaceAll(PLACEHOLDER_PATTERN, '')
    .replaceAll(/\s/gu, '');
  return remaining.length >= MIN_SPECIFIC_CHARACTERS;
}
