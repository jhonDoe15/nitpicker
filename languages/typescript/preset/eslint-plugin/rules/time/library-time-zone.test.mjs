import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-local-time-zone.mjs';

const tester = typescriptRuleTester();
const LUXON = "import { DateTime } from 'luxon';\n";
const FNS = "import { format, startOfDay, addDays, addHours, parseISO } from 'date-fns';\n";
const DAYJS = "import dayjs from 'dayjs';\n";
const MOMENT = "import moment from 'moment-timezone';\n";

function invalid(code, messageId, data) {
  return { code, errors: [{ messageId, ...(data === undefined ? {} : { data }) }] };
}

tester.run('no-local-time-zone on date libraries', rule, {
  valid: [
    `${LUXON}export const now = () => DateTime.utc();`,
    `${LUXON}export const now = () => DateTime.now().setZone('utc');`,
    `${LUXON}export const now = () => DateTime.now().toUTC().toISO();`,
    `${LUXON}export const ms = () => DateTime.now().toMillis();`,
    `${LUXON}export const at = (date: Date) => DateTime.fromJSDate(date, { zone: 'utc' });`,
    `${LUXON}export const at = (text: string, zone: string) => DateTime.fromISO(text, { zone });`,
    `${LUXON}export const at = (text: string) => DateTime.fromISO(text, { setZone: true });`,
    `${LUXON}export const at = (y: number) => DateTime.local(y, 1, 1, { zone: 'Europe/Paris' });`,
    `${LUXON}export const later = (other: DateTime) => DateTime.now().diff(other);`,
    "import * as luxon from 'luxon';\nexport const now = () => luxon.DateTime.utc();",
    "import { DateTime } from './clock';\nexport const now = () => DateTime.now();",
    "import { formatInTimeZone } from 'date-fns-tz';\nexport const label = (date: Date) => formatInTimeZone(date, 'UTC', 'yyyy-MM-dd');",
    `${FNS}import { tz } from '@date-fns/tz';\nexport const label = (date: Date) => format(date, 'yyyy-MM-dd', { in: tz('UTC') });`,
    `${FNS}import { TZDate } from '@date-fns/tz';\nexport const start = (ms: number) => startOfDay(new TZDate(ms, 'UTC'));`,
    `${FNS}import { toZonedTime } from 'date-fns-tz';\nexport const label = (date: Date, zone: string) => format(toZonedTime(date, zone), 'yyyy-MM-dd');`,
    `${FNS}export const later = (date: Date) => addHours(date, 2);`,
    `${FNS}export const at = () => parseISO('2024-01-01T10:00:00Z');`,
    "import { isValid, max } from 'date-fns';\nexport const ok = (date: Date) => isValid(date) && max([date]);",
    `${DAYJS}export const now = () => dayjs.utc().format();`,
    `${DAYJS}export const now = () => dayjs().utc().format('YYYY-MM-DD');`,
    `${DAYJS}export const at = (zone: string) => dayjs().tz(zone).startOf('day');`,
    `${DAYJS}export const stamp = () => dayjs().toISOString();`,
    `${DAYJS}export const ms = (value: string) => dayjs(value).valueOf();`,
    `${DAYJS}export const before = (a: string, b: string) => dayjs(a).isBefore(b);`,
    `${DAYJS}export const age = (a: string, b: string) => dayjs(a).diff(b, 'hour');`,
    `${LUXON}export const valid = (text: string) => DateTime.fromISO(text).isValid;`,
    `${LUXON}import type { DateTimeOptions } from 'luxon';\nexport const at = (text: string, options: DateTimeOptions) => DateTime.fromISO(text, options);`,
    `${MOMENT}export const now = (zone: string) => moment.tz(zone).format();`,
    `${MOMENT}export const now = () => moment.utc().startOf('day');`,
    "const dayjs = require('dayjs');\nexport const now = () => dayjs().utc();",
  ],
  invalid: [
    invalid(`${LUXON}export const now = () => DateTime.now();`, 'luxonLocal', {
      name: 'DateTime.now',
    }),
    invalid(
      `${LUXON}export const at = (date: Date) => DateTime.fromJSDate(date).startOf('day');`,
      'luxonLocal',
    ),
    invalid(
      `${LUXON}export const at = (text: string) => DateTime.fromISO(text).toFormat('yyyy');`,
      'luxonLocal',
    ),
    invalid(`${LUXON}export const at = () => DateTime.local(2024, 1, 1);`, 'luxonLocal'),
    invalid(
      `${LUXON}export const at = (date: Date) => DateTime.fromJSDate(date, { zone: 'local' });`,
      'luxonLocal',
    ),
    invalid(
      `${LUXON}export const at = () => DateTime.now().setZone('system').toISO();`,
      'luxonLocal',
    ),
    invalid(`${LUXON}export const label = () => DateTime.now().toISO();`, 'luxonLocal'),
    invalid(
      "import * as luxon from 'luxon';\nexport const now = () => luxon.DateTime.now();",
      'luxonLocal',
    ),
    invalid(
      "const { DateTime } = require('luxon');\nexport const now = () => DateTime.now();",
      'luxonLocal',
    ),
    invalid(
      `${FNS}export const label = (date: Date) => format(date, 'yyyy-MM-dd');`,
      'dateFnsLocal',
      {
        name: 'format',
      },
    ),
    invalid(`${FNS}export const start = (date: Date) => startOfDay(date);`, 'dateFnsLocal'),
    invalid(`${FNS}export const next = (date: Date) => addDays(date, 1);`, 'dateFnsLocal'),
    invalid(`${FNS}export const at = (text: string) => parseISO(text);`, 'dateFnsLocal'),
    invalid(
      "import * as fns from 'date-fns';\nexport const end = (date: Date) => fns.endOfMonth(date);",
      'dateFnsLocal',
    ),
    invalid(
      "import isToday from 'date-fns/isToday';\nexport const today = (date: Date) => isToday(date);",
      'dateFnsLocal',
    ),
    invalid(
      "import { formatWithOptions } from 'date-fns/fp';\nexport const label = formatWithOptions({}, 'yyyy');",
      'dateFnsLocal',
    ),
    invalid(
      `${DAYJS}export const days = (a: string, b: string) => dayjs(a).diff(b, 'day');`,
      'dayjsLocal',
    ),
    invalid(`${LUXON}export const at = (year: number) => DateTime.local(year);`, 'luxonLocal'),
    invalid(
      `${LUXON}export const at = (text: string, format: string) => DateTime.fromFormat(text, format);`,
      'luxonLocal',
    ),
    invalid(
      "import { add } from 'date-fns';\nexport const next = (date: Date) => add(date, { days: 1 });",
      'dateFnsLocal',
    ),
    invalid(`${DAYJS}export const label = () => dayjs().format('YYYY-MM-DD');`, 'dayjsLocal', {
      name: 'dayjs()',
    }),
    invalid(
      `${DAYJS}export const start = (value: string) => dayjs(value).startOf('day');`,
      'dayjsLocal',
    ),
    invalid(
      `${DAYJS}export const at = (seconds: number) => dayjs.unix(seconds).format();`,
      'dayjsLocal',
    ),
    invalid(
      `${DAYJS}export const now = () => { const value = dayjs(); return value; };`,
      'dayjsLocal',
    ),
    invalid(`${MOMENT}export const label = () => moment().format('LLL');`, 'dayjsLocal', {
      name: 'moment()',
    }),
    invalid(
      "import moment from 'moment';\nexport const later = () => moment().add(1, 'day');",
      'dayjsLocal',
    ),
  ],
});
