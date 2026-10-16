import { stripAnsi } from '../../../preset/test-console/ansi.mjs';

const ABSOLUTE_PATH_PATTERN =
  /(?<![\w/:.\\-])(?:<(?:root|tmp|home)>)?(?:file:\/\/)?(?:[A-Za-z]:)?(?:[\\/][\w.@+~$%-]+)+/gu;

const TIMESTAMP_PATTERN =
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/gu;

const HEX_PATTERN = /\b0x[0-9a-fA-F]+\b/gu;

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;

const IDENTIFIER_PATTERN =
  /(?<![A-Za-z0-9])(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z0-9]{6,}(?![A-Za-z0-9])/gu;

const NUMBER_PATTERN =
  /(?<![A-Za-z_$])\d+(?:[.,]\d+)*(?:%|\s?(?:ms|s|sec|secs|seconds?|min|minutes?|hours?|[kmg]i?b|bytes?)\b)?/giu;

const PLACEHOLDER_PATTERN = /<(?:time|hex|uuid|id|n|root|tmp|home)>/gu;

const MIN_SPECIFIC_CHARACTERS = 3;

const MAX_MESSAGE_LENGTH = 300;

function lastSegment(match) {
  return match.split(/[\\/]/u).at(-1);
}

export function normalizeConsoleMessage(line) {
  return stripAnsi(line)
    .replaceAll(ABSOLUTE_PATH_PATTERN, lastSegment)
    .replaceAll(TIMESTAMP_PATTERN, '<time>')
    .replaceAll(HEX_PATTERN, '<hex>')
    .replaceAll(UUID_PATTERN, '<uuid>')
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
