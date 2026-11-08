import { closingIndex, enclosingOpen, splitArguments } from '../kotlin-source.mjs';

const NOW_TYPES = [
  'LocalDate',
  'LocalDateTime',
  'LocalTime',
  'MonthDay',
  'OffsetDateTime',
  'OffsetTime',
  'Year',
  'YearMonth',
  'ZonedDateTime',
];
const DEFAULT_ZONE_CALLS = [
  new RegExp(
    String.raw`(?<![\w.])(?:java\.time\.)?(?:${NOW_TYPES.join('|')})\s*\.\s*now\s*\(\s*\)`,
    'g',
  ),
  /(?<![\w.])(?:java\.time\.)?Clock\s*\.\s*systemDefaultZone\s*\(\s*\)/g,
  /(?<![\w.])(?:java\.time\.)?ZoneId\s*\.\s*systemDefault\s*\(\s*\)/g,
  /(?<![\w.])(?:java\.util\.)?TimeZone\s*\.\s*getDefault\s*\(\s*\)/g,
  /(?<![\w.])(?:kotlinx\.datetime\.)?TimeZone\s*\.\s*currentSystemDefault\s*\(\s*\)/g,
];
const CALENDAR_CALL =
  /(?<![\w.])(?:java\.util\.)?(?:Calendar\s*\.\s*getInstance|GregorianCalendar)\s*\(/g;
const DATE_FORMAT_CALL = /(?<![\w.])(?:java\.text\.)?SimpleDateFormat\s*\(/g;
const DATE_FIELD_ARGUMENTS = 3;
const LOCALE_ARGUMENT = /^\s*(?:(?:java\.util\.)?Locale\b|\w*[Ll]ocale\s*$)/;
const CHAINED_SETUP = /^\s*\.\s*(?:apply|also|run)\s*\{/;
const ZONE_SETTING = /\btimeZone\s*=|\bsetTimeZone\s*\(/;
const ASSIGNED_NAME = /\b(?:val|var)\s+(\w+)\s*(?::[^=]+)?=\s*$/;

const TIME_ZONE_MESSAGES = {
  DefaultTimeZone:
    'Pass a `Clock` or a zone: `LocalDate.now(clock)` with an injected `Clock`, `ZoneId.of("UTC")` or a configured zone; with kotlinx.datetime, `TimeZone.UTC` or `TimeZone.of(zone)`. This reads the JVM default time zone, which changes with the server.',
  LegacyCalendarApi:
    'Use java.time with an explicit zone: `Instant`, `ZonedDateTime.now(clock)`, and a `DateTimeFormatter` with `withZone(zone)`. `Calendar.getInstance()` and `GregorianCalendar()` without a `TimeZone`, and a `SimpleDateFormat` whose `timeZone` is never set, read the default time zone, and `SimpleDateFormat` is not thread-safe.',
};

function defaultZoneCalls(code) {
  return DEFAULT_ZONE_CALLS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => ({ rule: 'DefaultTimeZone', offset: match.index })),
  );
}

function readsDefaultZone(code, match) {
  const { parts } = splitArguments(code, match.index + match[0].length - 1);
  const texts = parts.map(({ start, end }) => code.slice(start, end));
  const dateFields = match[0].includes('GregorianCalendar') && texts.length >= DATE_FIELD_ARGUMENTS;
  return dateFields || texts.every((text) => LOCALE_ARGUMENT.test(text));
}

function setupBlock(code, from) {
  const chained = CHAINED_SETUP.exec(code.slice(from));
  if (chained === null) {
    return '';
  }
  const open = from + chained[0].length - 1;
  return code.slice(open, closingIndex(code, open));
}

function namedSetup(code, name, offset) {
  const block = enclosingOpen(code, offset);
  const scope = block === -1 ? code : code.slice(block, closingIndex(code, block));
  const setting = new RegExp(
    String.raw`\b${name}\s*\.\s*(?:timeZone\s*=|setTimeZone\s*\(|(?:apply|also|run)\s*\{[^}]*\btimeZone\s*=)`,
  );
  return setting.test(scope);
}

function setsZone(code, match) {
  const close = closingIndex(code, match.index + match[0].length - 1);
  if (ZONE_SETTING.test(setupBlock(code, close + 1))) {
    return true;
  }
  const lineStart = code.lastIndexOf('\n', match.index) + 1;
  const name = ASSIGNED_NAME.exec(code.slice(lineStart, match.index))?.[1];
  return name !== undefined && namedSetup(code, name, match.index);
}

function legacyCalendarCalls(code) {
  const calendars = [...code.matchAll(CALENDAR_CALL)].filter((match) =>
    readsDefaultZone(code, match),
  );
  const formats = [...code.matchAll(DATE_FORMAT_CALL)].filter((match) => !setsZone(code, match));
  return [...calendars, ...formats].map((match) => ({
    rule: 'LegacyCalendarApi',
    offset: match.index,
  }));
}

export function defaultTimeZones(scanned) {
  return [...defaultZoneCalls(scanned.code), ...legacyCalendarCalls(scanned.code)];
}

export const kotlinSourceRules = { messages: TIME_ZONE_MESSAGES, main: [defaultTimeZones] };
