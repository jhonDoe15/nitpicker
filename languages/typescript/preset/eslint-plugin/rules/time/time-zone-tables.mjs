export const LOCAL_DATE_METHODS = {
  getFullYear: 'getUTCFullYear',
  getYear: 'getUTCFullYear',
  getMonth: 'getUTCMonth',
  getDate: 'getUTCDate',
  getDay: 'getUTCDay',
  getHours: 'getUTCHours',
  getMinutes: 'getUTCMinutes',
  setFullYear: 'setUTCFullYear',
  setYear: 'setUTCFullYear',
  setMonth: 'setUTCMonth',
  setDate: 'setUTCDate',
  setHours: 'setUTCHours',
  setMinutes: 'setUTCMinutes',
};

export const OFFSET_METHOD = 'getTimezoneOffset';

export const LOCALE_METHODS = ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString'];

export const LOCAL_STRING_METHODS = ['toString', 'toDateString', 'toTimeString'];

export const ZONED_DATE_TYPES = ['TZDate', 'TZDateMini', 'UTCDate', 'UTCDateMini'];

export const LUXON_PACKAGES = ['luxon'];
export const DATE_FNS_PACKAGES = ['date-fns'];
export const ZONE_PACKAGES = ['@date-fns/tz', '@date-fns/utc', 'date-fns-tz'];
export const DAYJS_PACKAGES = ['dayjs', 'moment', 'moment-timezone'];

export const LUXON_FACTORIES = [
  'now',
  'local',
  'fromJSDate',
  'fromISO',
  'fromFormat',
  'fromSQL',
  'fromMillis',
  'fromSeconds',
  'fromObject',
  'fromRFC2822',
];
export const LUXON_OPTION_POSITIONS = {
  fromJSDate: 1,
  fromISO: 1,
  fromFormat: 2,
  fromSQL: 1,
  fromMillis: 1,
  fromSeconds: 1,
  fromObject: 1,
  fromRFC2822: 1,
};
export const LUXON_ZONE_KEYS = ['zone', 'setZone'];
export const LOCAL_ZONE_NAMES = ['local', 'system'];

export const CHAIN_READS = ['isValid', 'ts', 'offset', 'zoneName'];

export const DAYJS_FACTORIES = ['', 'unix'];

export const CHAIN_ZONE_SETTERS = {
  luxon: ['setZone', 'toUTC'],
  dayjs: ['utc', 'tz', 'utcOffset'],
};

export const CHAIN_INSTANTS = {
  luxon: ['toMillis', 'toSeconds', 'toUnixInteger', 'valueOf', 'toJSDate', 'isValid'],
  dayjs: ['valueOf', 'unix', 'toISOString', 'toDate', 'toJSON', 'isValid'],
};

export const CHAIN_COMPARISONS = {
  luxon: ['diff', 'equals', 'toRelative'],
  dayjs: ['isBefore', 'isAfter', 'isSame', 'diff'],
};

const DAY_NAMES = 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday';
const CALENDAR_UNITS = 'Day|Week|ISOWeek|Month|Quarter|Year|ISOWeekYear|WeekYear|Decade|Hour';

export const DATE_FNS_CALENDAR = new RegExp(
  [
    '^(?:add|sub|set|isLeapYear|intlFormat)$',
    '^(?:format|formatDate|formatISO|formatISO9075|formatRFC3339|formatRelative|lightFormat)$',
    '^(?:parse|parseISO)$',
    `^(?:start|end)Of(?:${CALENDAR_UNITS}|Today|Tomorrow|Yesterday)$`,
    '^(?:add|sub)(?:Days|Weeks|Months|Quarters|Years|BusinessDays|ISOWeekYears)$',
    '^(?:get|set)(?:Date|Day|Hours|Minutes|Month|Year|Quarter|Week|ISOWeek|ISOWeekYear|WeekYear|DayOfYear|ISODay)$',
    '^differenceIn(?:Calendar\\w+|Days|Weeks|Months|Quarters|Years|BusinessDays|ISOWeekYears)$',
    `^isSame(?:${CALENDAR_UNITS})$`,
    `^isThis(?:${CALENDAR_UNITS})$`,
    `^is(?:Today|Tomorrow|Yesterday|Weekend|FirstDayOfMonth|LastDayOfMonth|${DAY_NAMES})$`,
    '^each(?:Day|Weekend|Week|Month|Quarter|Year|Hour)Of\\w+$',
    '^(?:lastDayOf|getDaysIn|getWeeksIn)\\w+$',
    `^(?:next|previous)(?:Day|${DAY_NAMES})$`,
  ].join('|'),
  'u',
);

export const DATE_ONLY = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/u;
export const WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/iu;
export const TRAILING_TIME = /[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/u;
export const NAMED_ZONE = /(?:\bGMT|\bUTC|\dZ|[+-]\d{2}:?\d{2})(?:\s*\([^)]*\))?$/iu;
export const SUB_DAY_UNITS = [
  'ms',
  'millisecond',
  'milliseconds',
  's',
  'second',
  'seconds',
  'm',
  'minute',
  'minutes',
  'h',
  'hour',
  'hours',
];
