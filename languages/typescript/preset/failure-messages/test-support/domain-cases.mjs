import { strictDomainConfig } from '../../eslint-config/strict/strict-domain.mjs';
import { policyFailureMessageCases } from './policy/policy-cases.mjs';

const filename = 'src/main/features/billing/domain/invoice.ts';

function domainCase(name, banned, allowed) {
  return { name: `domain: ${name}`, config: strictDomainConfig, filename, banned, allowed };
}

export const domainFailureMessageCases = [
  domainCase('let names const', 'let total = 1;', 'const'),
  domainCase(
    'react import names adapters/',
    "import { useState } from 'react'; export const run = useState;",
    'components, hooks and stores live in adapters/ (or shared/ui)',
  ),
  domainCase(
    'destructuring assignment names spread',
    'const run = (o: { readonly a: number }) => { ({ a: o.a } = { a: 1 }); };',
    '{ ...value, field }',
  ),
  domainCase(
    'Reflect.set names spread',
    "const run = (o: { readonly a: number }) => Reflect.set(o, 'a', 1);",
    'return a new value with spread',
  ),
  domainCase(
    'Atomics.store names spread',
    'const run = (t: Int32Array) => Atomics.store(t, 0, 1);',
    'through Reflect or Atomics',
  ),
  domainCase(
    'for loop names map',
    'const run = (xs: readonly number[]) => { for (const x of xs) { x; } };',
    'map, filter, flatMap',
  ),
  domainCase(
    'while loop names map',
    'const run = () => { while (false) { 1; } };',
    'Object.groupBy',
  ),
  domainCase(
    'forEach names map',
    'const run = (xs: readonly number[]) => xs.forEach((x) => x);',
    'Object.fromEntries',
  ),
  domainCase(
    'reduce without an initial value names the initial value',
    'const run = (xs: readonly number[]) => xs.reduce((a, x) => a + x);',
    'pass one, e.g. xs.reduce((sum, x) => sum + x, 0)',
  ),
  domainCase(
    'reduceRight names reduce with an initial value',
    'const run = (xs: readonly number[]) => xs.reduceRight((a, x) => a + x, 0);',
    'xs.reduce((sum, x) => sum + x, 0)',
  ),
  domainCase('Date.now names a parameter', 'export const now = Date.now();', 'as a parameter'),
  domainCase('dayjs() names a parameter', 'export const now = dayjs();', 'as a parameter'),
  domainCase(
    'DateTime.now names a parameter',
    'export const now = DateTime.now();',
    'as a parameter',
  ),
  domainCase('new Date() names a parameter', 'export const now = new Date();', 'as a parameter'),
  domainCase(
    'Math.random names a parameter',
    'export const roll = Math.random();',
    'as a parameter',
  ),
  domainCase(
    'randomUUID names a parameter',
    'export const id = crypto.randomUUID();',
    'as a parameter',
  ),
  domainCase(
    'push names a new array',
    'const run = (xs: readonly number[]) => xs.push(1);',
    'new array',
  ),
  domainCase(
    'property assignment names spread',
    'const run = (o: { readonly a: number }) => { o.a = 2; };',
    'new object with spread',
  ),
  domainCase(
    'property increment names spread',
    'const run = (o: { readonly a: number }) => { o.a++; };',
    'new object with spread',
  ),
  domainCase(
    'delete names Object.fromEntries',
    'const run = (o: { readonly a: number }) => { delete o.a; };',
    'Object.fromEntries',
  ),
  domainCase(
    'Object.assign onto a parameter names spread',
    'const run = (o: { readonly a: number }) => Object.assign(o, { a: 1 });',
    '{ ...value, field }',
  ),
  domainCase('class names functions', 'class Invoice {}', 'functions'),
  domainCase('this names functions', 'function run() { return this; }', 'functions'),
  domainCase(
    'mutable array parameter names readonly',
    'function run(xs: number[]) { return xs; }',
    'readonly T[]',
  ),
  domainCase(
    'Array generic names ReadonlyArray',
    'function run(xs: Array<number>) { return xs; }',
    'ReadonlyArray',
  ),
  domainCase(
    'unknown parameter names the zod schema in adapters/',
    'export function run(input: unknown) { return input; }',
    'adapters/ parses the input with a zod schema',
  ),
  domainCase(
    'unknown property names a readonly type in domain/',
    'export type Row = { readonly payload: unknown };',
    'Write a readonly type for this value in domain/',
  ),
  domainCase('mutable property names readonly', 'type Invoice = { total: number };', 'readonly'),
  ...policyFailureMessageCases,
];
