import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './reusable-object-per-call.mts';

const tester = typescriptRuleTester();

function flagged(code: string, type: string) {
  return { code, errors: [{ messageId: 'perCall', data: { type } }] };
}

function hoisted(code: string, type: string, ..._rest: string[]) {
  return flagged(code, type);
}

function cached(code: string) {
  return flagged(code, 'Ajv');
}

const AJV = 'import Ajv from "ajv";\n';

tester.run('reusable-object-per-call', rule, {
  valid: [
    'export const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });',
    'const OPTIONS = { dateStyle: "short" } as const; const day = new Intl.DateTimeFormat("en-GB", OPTIONS); export function show(date: Date) { return day.format(date); }',
    'export class Prices { private readonly money = new Intl.NumberFormat("en-US"); show(value: number) { return this.money.format(value); } }',
    'export class Prices { static readonly MONEY = new Intl.NumberFormat("en-US"); }',
    'export class Prices { private readonly money: Intl.NumberFormat; constructor() { this.money = new Intl.NumberFormat("en-US"); } }',
    'export class Prices { static money: Intl.NumberFormat; static { Prices.money = new Intl.NumberFormat("en-US"); } }',
    'export function show(value: number, locale: string) { return new Intl.NumberFormat(locale).format(value); }',
    'export function show(value: number, currency: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value); }',
    'export function moneyFormat() { return new Intl.NumberFormat("en-US"); }',
    'export const moneyFormat = () => new Intl.NumberFormat("en-US");',
    'let money: Intl.NumberFormat | undefined; export function show(value: number) { money ??= new Intl.NumberFormat("en-US"); return money.format(value); }',
    'let money: Intl.NumberFormat | undefined; export function show(value: number) { if (!money) { money = new Intl.NumberFormat("en-US"); } return money.format(value); }',
    'const cache = new Map<string, Intl.NumberFormat>(); export function warm() { cache.set("en", new Intl.NumberFormat("en")); }',
    'export const money = (() => { const format = new Intl.NumberFormat("en-US"); return format; })();',
    'import { useMemo } from "react"; export function Price({ value }: { value: number }) { const money = useMemo(() => new Intl.NumberFormat("en-US"), []); return money.format(value); }',
    'export function show(value: number) { const Intl = { NumberFormat: class { format(n: number) { return String(n); } } }; return new Intl.NumberFormat().format(value); }',
    `${AJV}export const ajv = new Ajv({ allErrors: true });`,
    'const formats = new Map<string, Intl.NumberFormat>(); export function money(key: string) { let format = formats.get(key); if (!format) { format = new Intl.NumberFormat("en"); formats.set(key, format); } return format; }',
    'export function formats() { return { money: new Intl.NumberFormat("en-US") }; }',
    'export function formatter() { const money = new Intl.NumberFormat("en-US"); return (value: number) => money.format(value); }',
    'export function setup() { const money = new Intl.NumberFormat("en-US"); return { money }; }',
    'export function zone() { return new Intl.DateTimeFormat().resolvedOptions().timeZone; }',
    'export function zone() { return new Intl.DateTimeFormat("en-US").resolvedOptions().timeZone; }',
    'export function zone() { const format = new Intl.DateTimeFormat(); return format.resolvedOptions().timeZone; }',
    'export class Prices { show(value: number) { return new Intl.NumberFormat().format(value); } }',
    'export function show(date: Date) { return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(date); }',
    'export function show(date: Date) { return new Intl.DateTimeFormat([], { hour: "numeric" }).format(date); }',
    'export function words(text: string) { return [...new Intl.Segmenter().segment(text)]; }',
    'export function names() { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return new Intl.DisplayNames(["en"], { type: "language" }); } }',
    'export function names() { try { return makeNames(); } catch { const display = new Intl.DisplayNames(["en"], { type: "region" }); return display.of("DE"); } }',
    'export function names() { try { return makeNames(); } catch (error) { return new Intl.Collator("de").compare("a", "b") + String(error); } }',
    'class Ajv { compile() { return () => true; } } export function valid(data: unknown) { return new Ajv().compile()(data); }',
  ],
  invalid: [
    hoisted(
      'export function show(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }',
      'Intl.NumberFormat',
      'NUMBER_FORMAT',
      'const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });\n\nexport function show(value: number) { return NUMBER_FORMAT.format(value); }',
    ),
    flagged(
      'export function show(date: Date) { const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "short" }); return day.format(date); }',
      'Intl.DateTimeFormat',
    ),
    hoisted(
      'export function sort(names: string[]) { return names.toSorted(new Intl.Collator("de").compare); }',
      'Intl.Collator',
      'COLLATOR',
      'const COLLATOR = new Intl.Collator("de");\n\nexport function sort(names: string[]) { return names.toSorted(COLLATOR.compare); }',
    ),
    flagged(
      'export function ago(days: number) { return Intl.RelativeTimeFormat ? new globalThis.Intl.RelativeTimeFormat("en").format(-days, "day") : ""; }',
      'Intl.RelativeTimeFormat',
    ),
    flagged(
      'export function list(names: string[]) { return Intl.ListFormat ? Intl.DateTimeFormat("en").format() + names.join() : ""; }',
      'Intl.DateTimeFormat',
    ),
    hoisted(
      'export const show = (values: number[]) => values.map((value) => new Intl.NumberFormat("en").format(value));',
      'Intl.NumberFormat',
      'NUMBER_FORMAT',
      'const NUMBER_FORMAT = new Intl.NumberFormat("en");\n\nexport const show = (values: number[]) => values.map((value) => NUMBER_FORMAT.format(value));',
    ),
    hoisted(
      'import { useState } from "react"; export function Price({ value }: { value: number }) { const [shown] = useState(value); return new Intl.NumberFormat("en-US").format(shown); }',
      'Intl.NumberFormat',
      'NUMBER_FORMAT',
      'import { useState } from "react";\n\nconst NUMBER_FORMAT = new Intl.NumberFormat("en-US"); export function Price({ value }: { value: number }) { const [shown] = useState(value); return NUMBER_FORMAT.format(shown); }',
    ),
    hoisted(
      'export function show(value: number) { return { text: new Intl.NumberFormat("en-US").format(value) }; }',
      'Intl.NumberFormat',
      'NUMBER_FORMAT',
      'const NUMBER_FORMAT = new Intl.NumberFormat("en-US");\n\nexport function show(value: number) { return { text: NUMBER_FORMAT.format(value) }; }',
    ),
    hoisted(
      'export function show(value: number) { const money = new Intl.NumberFormat("en-US"); return money.format(value); }',
      'Intl.NumberFormat',
      'NUMBER_FORMAT',
      'const NUMBER_FORMAT = new Intl.NumberFormat("en-US");\n\nexport function show(value: number) {  return NUMBER_FORMAT.format(value); }',
    ),
    hoisted(
      'export function show(values: number[]) { const money = new Intl.NumberFormat("en-US"); return values.map((value) => money.format(value)); }',
      'Intl.NumberFormat',
      'NUMBER_FORMAT',
      'const NUMBER_FORMAT = new Intl.NumberFormat("en-US");\n\nexport function show(values: number[]) {  return values.map((value) => NUMBER_FORMAT.format(value)); }',
    ),
    cached(
      `${AJV}export function valid(schema: object, data: unknown) { return new Ajv().compile(schema)(data); }`,
    ),
    cached(
      `${AJV}export function valid(schema: object, data: unknown) { const ajv = new Ajv(); const check = ajv.compile(schema); return check(data); }`,
    ),
    flagged(
      `${AJV}export function valid(data: unknown) { return new Ajv().compile({ type: "object" })(data); }`,
      'Ajv',
    ),
    flagged(
      `${AJV}export function valid(data: unknown) { return new Ajv({ allErrors: true }).validate({ type: "string" }, data); }`,
      'Ajv',
    ),
    flagged(`${AJV}export function make() { return new Ajv().errors; }`, 'Ajv'),
    flagged(
      'export function show(value: number) { try { return String(value); } finally { new Intl.Collator("de").compare("a", "b"); } }',
      'Intl.Collator',
    ),
  ],
});
