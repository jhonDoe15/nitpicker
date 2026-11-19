import { typedIoProject } from '../../test-support/projects/typed-io-project.mts';
import { rule } from './no-unguarded-deleted-items.mts';

const TYPES = [
  'export interface Item { id: string; isDeleted: boolean; label: string; groupId: string | null }',
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
    body(
      'export function f() { for (let i = 0; i < items.length; i++) { const item = items[i]; if (item.isDeleted) continue; console.log(item.id); } }',
    ),
    body(
      'export function f(g: string) { for (let i = items.length - 1; i >= 0; i--) { const item = items[i]; if (item.groupId === g && !item.isDeleted) { return i + 1; } } return -1; }',
    ),
    body(
      'export function f() { for (let i = 0; i < items.length; i++) { if (!isLive(items[i])) continue; console.log(items[i].id); } }',
    ),
    body(
      'export function f(out: string[]) { for (let i = 0; i < items.length; i++) { out[i] = "x"; } }',
    ),
    body(
      'export function f(list: readonly NonDeleted<Item>[]) { for (let i = 0; i < list.length; i++) { console.log(list[i].id); } }',
    ),
    body(
      'export function f() { for (let i = 0; i < items.length; i++) { items[i].isDeleted = true; } }',
    ),
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
    {
      ...body(
        'export function frameIndex(frameId: string) {\n  for (let index = items.length - 1; index >= 0; index--) {\n    const item = items[index];\n    if (item.id === frameId) {\n      return index;\n    } else if (item.groupId === frameId) {\n      return index + 1;\n    }\n  }\n  return -1;\n}',
      ),
      errors: [{ message: /`for` over `Item`/u }],
    },
    {
      ...body(
        'export function labels() { const out: string[] = []; for (let i = 0; i < items.length; i++) { out.push(items[i].label); } return out; }',
      ),
      errors: [{ messageId: 'unguarded' }],
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

const READONLY_TYPES = [
  'type ElementBase = Readonly<{ id: string; isDeleted: boolean; frameId: string | null }>;',
  'export type Element = ElementBase & Readonly<{ type: "rect" }>;',
  'export declare const elements: readonly Element[];',
].join('\n');
const READONLY_GUARDED = Array.from(
  { length: 5 },
  (_, index) => `export const g${String(index)} = elements.filter((e) => !e.isDeleted).length;`,
);
const { tester: readonlyTester, typed: readonlyTyped } = typedIoProject(
  'deleted-items-readonly',
  READONLY_TYPES,
  { 'guarded.ts': ["import { elements } from './store';", ...READONLY_GUARDED].join('\n') },
);

readonlyTester.run('no-unguarded-deleted-items on a flag declared in Readonly<{...}>', rule, {
  valid: [
    readonlyTyped(
      "import { elements } from './store';\nexport const ids = elements.filter((e) => !e.isDeleted).map((e) => e.id);",
    ),
  ],
  invalid: [
    {
      ...readonlyTyped(
        "import { elements } from './store';\nexport function at(frameId: string) {\n  for (let index = elements.length - 1; index >= 0; index--) {\n    const element = elements[index];\n    if (element.frameId === frameId) {\n      return index + 1;\n    }\n  }\n  return -1;\n}",
      ),
      errors: [{ message: /`for` over `Element`/u }],
    },
  ],
});

const INCLUDING_TYPES = [
  'export interface Item { id: string; isDeleted: boolean; label: string }',
  'export declare const items: readonly Item[];',
  'export declare function getItemsIncludingDeleted(): readonly Item[];',
  'export declare function withDeletedItems(): readonly Item[];',
  'export declare const trash: readonly Item[];',
].join('\n');
const INCLUDING_GUARDED = Array.from(
  { length: 30 },
  (_, index) => `export const g${String(index)} = items.filter((i) => !i.isDeleted).length;`,
);
const INCLUDING_OPEN = [
  'export const o1 = getItemsIncludingDeleted().map((item) => item.id);',
  'export const o2 = withDeletedItems().map((item) => item.label);',
  'const everything = getItemsIncludingDeleted();',
  'export const o3 = everything.filter((item) => item.label !== "");',
  'export function o4() { for (const item of everything) { console.log(item.id); } }',
  'export function o5(elementsIncludingDeleted: readonly Item[]) {',
  '  return elementsIncludingDeleted.map((item) => item.id);',
  '}',
  'export function o6(list: readonly Item[]) { return list.map((item) => item.id); }',
  'export const o7 = o6(getItemsIncludingDeleted());',
  'export const o8 = o6(everything);',
  'export function o9(list: readonly Item[]) { return list.map((item) => item.label); }',
  'export const o10 = o9(getItemsIncludingDeleted());',
  'export const o11 = o9(items);',
].join('\n');
const { tester: includingTester, typed: includingTyped } = typedIoProject(
  'deleted-items-including',
  INCLUDING_TYPES,
  {
    'guarded.ts': ["import { items } from './store';", ...INCLUDING_GUARDED].join('\n'),
    'open.ts': [
      "import { Item, items, getItemsIncludingDeleted, withDeletedItems } from './store';",
      INCLUDING_OPEN,
    ].join('\n'),
  },
);
const INCLUDING_HEADER = "import { Item, items, trash } from './store';\n";

includingTester.run('no-unguarded-deleted-items leaves including-deleted collections out', rule, {
  valid: [
    includingTyped(
      `${INCLUDING_HEADER}export function ids(elementsIncludingDeleted: Item[]) { for (const item of elementsIncludingDeleted) { console.log(item.id); } }`,
    ),
  ],
  invalid: [
    {
      ...includingTyped(
        `${INCLUDING_HEADER}export function ids(itemsWithDeletedAt: Item[]) { for (const item of itemsWithDeletedAt) { console.log(item.id); } }`,
      ),
      errors: [{ messageId: 'unguarded' }],
    },
    {
      ...includingTyped(
        `${INCLUDING_HEADER}export function ids(withDeletedAtLeast: Item[]) { return withDeletedAtLeast.map((item) => item.id); }`,
      ),
      errors: [{ messageId: 'unguarded' }],
    },
    {
      ...includingTyped(
        `${INCLUDING_HEADER}export function ids() { for (const item of items) { console.log(item.id); } }`,
      ),
      errors: [{ message: /`for\.\.\.of` over `Item`.*`isDeleted`.*8\d%/u }],
    },
    {
      ...includingTyped(
        `${INCLUDING_HEADER}export const labels = trash.map((item) => item.label);`,
      ),
      errors: [{ messageId: 'unguarded' }],
    },
  ],
});
