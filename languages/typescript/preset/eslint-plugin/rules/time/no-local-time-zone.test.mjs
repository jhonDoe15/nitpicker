import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-local-time-zone.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-local-time-zone-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      allowJs: true,
      checkJs: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2022', 'ES2022.Intl'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const typedTester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });
const untypedTester = typescriptRuleTester();

function typed(code, messageId, data, extension = 'ts') {
  const file = path.join(root, `src/case-${randomUUID()}.${extension}`);
  writeFileSync(file, code);
  return {
    filename: file,
    code,
    ...(messageId === undefined ? {} : { errors: [{ messageId, ...(data ? { data } : {}) }] }),
  };
}

typedTester.run('no-local-time-zone on Date values', rule, {
  valid: [
    'export const year = (date: Date) => date.getUTCFullYear();',
    'export const start = (date: Date) => { date.setUTCHours(0, 0, 0, 0); return date; };',
    'export const seconds = (date: Date) => date.getSeconds() + date.getMilliseconds();',
    'export const stamp = (date: Date) => date.toISOString();',
    'export const ms = (date: Date) => date.getTime();',
    "export const label = (date: Date) => date.toLocaleDateString('en-US', { timeZone: 'UTC' });",
    'export const label = (date: Date, options: Intl.DateTimeFormatOptions) => date.toLocaleString("en-US", options);',
    'export const amount = (value: number) => value.toLocaleString("en-US");',
    'export const text = (value: number) => value.toString();',
    'export const items = (list: string[]) => list.toLocaleString();',
    'type Calendar = { getMonth(): number }; export const month = (calendar: Calendar) => calendar.getMonth();',
    "export const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' });",
    "export const formatter = Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZone: 'Europe/Paris' });",
    'export const numbers = new Intl.NumberFormat("en-US");',
    'export const now = () => new Date();',
    'export const at = (ms: number) => new Date(ms);',
    "export const day = new Date('2024-01-01');",
    "export const at = new Date('2024-01-01T10:00:00Z');",
    "export const at = new Date('2024-01-01T10:00:00.123+02:00');",
    'export const utc = new Date(Date.UTC(2024, 0, 1));',
    "export const parsed = Date.parse('2024-01-01T10:00:00Z');",
    'export const parsed = (text: string) => Date.parse(text);',
    "export const at = new Date('Tue, 05 Mar 2024 10:00:00 GMT');",
    "export const at = Date.parse('2024-01-01 10:00:00 UTC');",
    'export const locale = () => { const { locale } = Intl.DateTimeFormat().resolvedOptions(); return locale; };',
    "export const label = (date: Date) => date.toLocaleString('en-US', { [String('timeZone')]: 'UTC' });",
    'export const at = (day: string) => new Date(`${day}T00:00:00Z`);',
    'export const zone = (zone: string) => new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().locale;',
    'class Date { getHours() { return 1; } } export const hours = new Date().getHours();',
    'class Zoned extends Date { override getHours() { return this.getUTCHours(); } }\nexport const hour = (zoned: Zoned) => zoned.getHours();',
  ].map((code) => typed(code)),
  invalid: [
    typed('export const year = (date: Date) => date.getFullYear();', 'localDateMethod', {
      name: 'getFullYear',
      utc: 'getUTCFullYear',
    }),
    typed('export const month = (date: Date) => date.getMonth() + 1;', 'localDateMethod'),
    typed('export const day = (date: Date) => date.getDate();', 'localDateMethod'),
    typed('export const weekday = (date: Date) => date.getDay();', 'localDateMethod'),
    typed('export const hour = () => new Date().getHours();', 'localDateMethod'),
    typed('export const minute = (date?: Date) => date?.getMinutes();', 'localDateMethod'),
    typed(
      'export const start = (date: Date) => { date.setHours(0, 0, 0, 0); return date; };',
      'localDateMethod',
      { name: 'setHours', utc: 'setUTCHours' },
    ),
    typed('export const offset = (date: Date) => date.getTimezoneOffset();', 'localOffset'),
    typed('export const hour = (date: Readonly<Date>) => date.getHours();', 'localDateMethod'),
    typed(
      "export const label = (date: Readonly<Date>) => date.toLocaleDateString('en-US');",
      'localeWithoutZone',
    ),
    typed(
      'class Stamp extends Date {}\nexport const hour = (stamp: Stamp) => stamp.getHours();',
      'localDateMethod',
    ),
    typed('export const label = (date: Date) => date.toLocaleDateString();', 'localeWithoutZone', {
      name: 'toLocaleDateString',
    }),
    typed(
      "export const label = (date: Date) => date.toLocaleTimeString('en-US', { hour: '2-digit' });",
      'localeWithoutZone',
    ),
    typed(
      "export const label = (date: Date) => date.toLocaleString('de-DE');",
      'localeWithoutZone',
    ),
    typed('export const label = (date: Date) => date.toString();', 'localString', {
      name: 'toString',
    }),
    typed('export const label = (date: Date) => date.toDateString();', 'localString'),
    typed("export const formatter = new Intl.DateTimeFormat('en-US');", 'intlWithoutZone'),
    typed(
      "export const formatter = Intl.DateTimeFormat('en-US', { dateStyle: 'short' });",
      'intlWithoutZone',
    ),
    typed(
      'export const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;',
      'serverZoneName',
    ),
    typed(
      'export const zone = () => { const { timeZone } = Intl.DateTimeFormat().resolvedOptions(); return timeZone; };',
      'serverZoneName',
    ),
    typed('export const start = new Date(2024, 0, 1);', 'localConstructor'),
    typed("export const at = new Date('2024-01-01T10:00');", 'localParse'),
    typed("export const at = new Date('2024-01-01 10:00:00');", 'localParse'),
    typed("export const at = new Date('March 7, 2024');", 'localParse'),
    typed("export const parsed = Date.parse('2024-01-01T10:00:00');", 'localParse'),
    typed('export const at = (day: string) => new Date(`${day}T00:00:00`);', 'localParse'),
    typed(
      '/** @param {Date} date */\nexport function year(date) { return date.getFullYear(); }',
      'localDateMethod',
      undefined,
      'js',
    ),
  ],
});

untypedTester.run('no-local-time-zone without type information', rule, {
  valid: [
    'export const month = (calendar) => calendar.getMonth();',
    'export const label = (value) => value.toLocaleString();',
    'export const year = () => new Date().getUTCFullYear();',
  ],
  invalid: [
    {
      code: 'export const hour = () => new Date().getHours();',
      errors: [{ messageId: 'localDateMethod' }],
    },
    {
      code: 'export function label() { const now = new Date(); return now.toLocaleDateString(); }',
      errors: [{ messageId: 'localeWithoutZone' }],
    },
  ],
});
