import { typedIoProject } from '../../test-support/typed-io-project.mjs';
import { rule } from './no-unguarded-deleted-items.mjs';

const TYPES = [
  'export interface Item { id: string; isDeleted: boolean; label: string }',
  'export type NonDeleted<T extends Item> = T & { isDeleted: false };',
  'export declare const items: readonly Item[];',
  'export declare function isLive(item: Item): boolean;',
  'export declare function notDeleted(item: Item): boolean;',
  'export interface Stat { id: string; deleted: number }',
  'export declare const stats: readonly Stat[];',
  'interface Base { id: string; isDeleted: boolean }',
  'export interface Rect extends Base { width: number }',
  'export interface Circle extends Base { radius: number }',
  'export type Shape = Rect | Circle;',
  'export declare const shapes: readonly Shape[];',
  'export function getNonDeletedItems(all: readonly Item[]): readonly NonDeleted<Item>[] {',
  '  return all.filter((item): item is NonDeleted<Item> => !item.isDeleted);',
  '}',
].join('\n');

const GUARDED = [
  "import { Item, items, shapes, getNonDeletedItems } from './store';",
  'export const a = items.filter((item) => !item.isDeleted).map((item) => item.id);',
  'export const b = items.find((item) => item.id === "x" && !item.isDeleted);',
  'export const c = getNonDeletedItems(items).map((item) => item.label);',
  'export function d() { for (const item of items) { if (item.isDeleted) { continue; } console.log(item.id); } }',
  'export function e(list: readonly Item[]) { return list.some((item) => !item.isDeleted && item.label === "a"); }',
  'export function f(list: Item[]) { return list.every((item) => item.isDeleted === false); }',
  'export const h = shapes.filter((shape) => !shape.isDeleted).length;',
  'export const j = shapes.filter((shape) => !shape.isDeleted).map((shape) => shape.id);',
  'export const k = shapes.find((shape) => shape.id === "b" && !shape.isDeleted);',
  'export const l = shapes.every((shape) => !shape.isDeleted);',
  'export const i = shapes.some((shape) => !shape.isDeleted && shape.id === "a");',
  'export const g = (list: readonly Item[]): Item | undefined => list.find((item) => !item.isDeleted);',
].join('\n');

const { tester, typed } = typedIoProject('deleted-items', TYPES, { 'guarded.ts': GUARDED });
const HEADER =
  "import { Item, NonDeleted, items, shapes, getNonDeletedItems, isLive, notDeleted, stats } from './store';\n";

function body(code) {
  return typed(`${HEADER}${code}`);
}

tester.run('no-unguarded-deleted-items', rule, {
  valid: [
    body('export const ids = items.filter((item) => !item.isDeleted).map((item) => item.id);'),
    body('export const ids = getNonDeletedItems(items).map((item) => item.id);'),
    body(
      'export function ids(list: readonly NonDeleted<Item>[]) { return list.map((item) => item.id); }',
    ),
    body(
      'export function ids(list: readonly NonDeleted<Item>[]) { for (const item of list) { console.log(item.id); } }',
    ),
    body('export const names = ["a"].map((name) => name.length);'),
    body(
      'export const labels = items.map((item) => { return item.isDeleted ? "" : item.label; });',
    ),
    body(
      'export function ids() { for (const item of items) { if (item.isDeleted) continue; console.log(item); } }',
    ),
    body('export const ids = items.filter(notDeleted).map((item) => item.id);'),
    body('export const ids = items.filter(isLive).map((item) => item.id);'),
    body(
      'export function show() { for (const item of items.filter(isLive)) { console.log(item.id); } }',
    ),
    body(
      'export function show() { for (const item of items) { if (!isLive(item)) continue; console.log(item.id); } }',
    ),
    body('export function mark() { for (const item of items) { item.isDeleted = true; } }'),
    body('export const ids = stats.map((stat) => stat.id);'),
  ],
  invalid: [
    {
      ...body('export const found = shapes.find((shape) => shape.id === "a");'),
      errors: [{ messageId: 'unguarded' }],
    },
    {
      ...body('export const ids = items.map((item) => item.id);'),
      errors: [{ messageId: 'unguarded' }],
    },
    {
      ...body('export const found = items.find((item) => item.label === "a");'),
      errors: [{ messageId: 'unguarded' }],
    },
    {
      ...body('export const at = items.findIndex((item) => item.id === "a");'),
      errors: [{ messageId: 'unguarded' }],
    },
    {
      ...body('export function show() { for (const item of items) { console.log(item.label); } }'),
      errors: [
        {
          message: /`for\.\.\.of` over `Item`.*`getNonDeletedItems`.*`NonDeleted`/u,
        },
      ],
    },
  ],
});

const BELOW = Array.from(
  { length: 5 },
  (_, index) => `export const u${String(index)} = items.map((item) => item.id);`,
);
const { tester: lowTester, typed: lowTyped } = typedIoProject('deleted-items-low', TYPES, {
  'unguarded.ts': ["import { items } from './store';", ...BELOW].join('\n'),
});

lowTester.run('no-unguarded-deleted-items below the threshold', rule, {
  valid: [
    lowTyped("import { items } from './store';\nexport const ids = items.map((item) => item.id);"),
  ],
  invalid: [],
});
