import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './reusable-object-per-call.mjs';

const tester = typescriptRuleTester();

function flagged(code, type) {
  return { code, errors: [{ messageId: 'perCall', data: { type } }] };
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
    'class Ajv { compile() { return () => true; } } export function valid(data: unknown) { return new Ajv().compile()(data); }',
  ],
  invalid: [
    flagged(
      'export function show(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }',
      'Intl.NumberFormat',
    ),
    flagged(
      'export function show(date: Date) { const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "short" }); return day.format(date); }',
      'Intl.DateTimeFormat',
    ),
    flagged(
      'export function sort(names: string[]) { return names.toSorted(new Intl.Collator("de").compare); }',
      'Intl.Collator',
    ),
    flagged(
      'export function ago(days: number) { return Intl.RelativeTimeFormat ? new globalThis.Intl.RelativeTimeFormat("en").format(-days, "day") : ""; }',
      'Intl.RelativeTimeFormat',
    ),
    flagged(
      'export function list(names: string[]) { return Intl.ListFormat ? Intl.DateTimeFormat("en").format() + names.join() : ""; }',
      'Intl.DateTimeFormat',
    ),
    flagged(
      'export class Prices { show(value: number) { return new Intl.NumberFormat().format(value); } }',
      'Intl.NumberFormat',
    ),
    flagged(
      'export const show = (values: number[]) => values.map((value) => new Intl.NumberFormat("en").format(value));',
      'Intl.NumberFormat',
    ),
    flagged(
      'import { useState } from "react"; export function Price({ value }: { value: number }) { const [shown] = useState(value); return new Intl.NumberFormat("en-US").format(shown); }',
      'Intl.NumberFormat',
    ),
    flagged(
      'export function show(value: number) { return { text: new Intl.NumberFormat("en-US").format(value) }; }',
      'Intl.NumberFormat',
    ),
    flagged(
      'export function show(value: number) { const money = new Intl.NumberFormat("en-US"); return money.format(value); }',
      'Intl.NumberFormat',
    ),
    flagged(
      'export function show(values: number[]) { const money = new Intl.NumberFormat("en-US"); return values.map((value) => money.format(value)); }',
      'Intl.NumberFormat',
    ),
    flagged(
      `${AJV}export function valid(schema: object, data: unknown) { return new Ajv().compile(schema)(data); }`,
      'Ajv',
    ),
  ],
});
