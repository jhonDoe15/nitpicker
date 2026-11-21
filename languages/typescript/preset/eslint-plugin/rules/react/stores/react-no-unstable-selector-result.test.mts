import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { createReactRuleTester } from '../test-support/tester.mts';
import { rule } from './react-no-unstable-selector-result.mts';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-selector-results-'));
mkdirSync(path.join(root, 'src/state'), { recursive: true });
mkdirSync(path.join(root, 'src/ui'), { recursive: true });
writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { react: '19' } }));
writeFileSync(
  path.join(root, 'src/state/stores.ts'),
  [
    "import { create } from 'zustand';",
    "import { createWithEqualityFn } from 'zustand/traditional';",
    "import { shallow } from 'zustand/shallow';",
    "import { useSelector, shallowEqual, type TypedUseSelectorHook } from 'react-redux';",
    'export const useCalendarStore = create<Calendar>()((set) => ({ startHour: 0, endHour: 24 }));',
    'export const usePlainStore = create((set) => ({ items: [] }));',
    'export const useShallowStore = createWithEqualityFn<Calendar>()((set) => ({ startHour: 0 }), shallow);',
    'export const useWrappedStore = withSelectors(create((set) => ({ items: [] })));',
    'export const useAppSelector = useSelector.withTypes<RootState>();',
    'export const useTypedSelector: TypedUseSelectorHook<RootState> = useSelector;',
    'export const useShallowSelector = (selector) => useSelector(selector, shallowEqual);',
    'const useHidden = create((set) => ({ items: [] }));',
    'export { useHidden as useRenamedStore };',
  ].join('\n'),
);
writeFileSync(
  path.join(root, 'src/state/index.ts'),
  "export { useCalendarStore as useCalendar, useShallowStore } from './stores';\n",
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const filename = path.join(root, 'src/ui/panel.tsx');
const tester = createReactRuleTester();

const imports = `import { useSelector, shallowEqual, useStore as useReduxStore } from 'react-redux';
import { create, useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useCalendarStore, usePlainStore, useShallowStore, useWrappedStore, useAppSelector, useTypedSelector, useShallowSelector, useRenamedStore } from '../state/stores';
import { useCalendar, useShallowStore as useBarrelShallow } from '../state';
import { useOtherStore } from 'store-kit';
const useLocalStore = create((set) => ({ items: [] }));
const useLocalSelector = useSelector.withTypes<RootState>();`;

function inPanel(body: string) {
  return `${imports}\nexport function Panel({ store }) {\n  ${body}\n  return <div />;\n}`;
}

function selector(body: string, messageId: 'reduxSelector' | 'zustandSelector', what: string) {
  return { filename, code: inPanel(body), errors: [{ messageId, data: { what } }] };
}

tester.run('react-no-unstable-selector-result', rule, {
  valid: [
    'const todos = useSelector((state) => state.todos);',
    'const count = useSelector((state) => state.todos.length);',
    'const made = build((draft) => ({ a: draft.a }));',
    'const first = useSelector((state) => state.todos.slice(0, 3));',
    'const list = useSelector((state) => state.todos ?? []);',
    'const first = useSelector((state) => state.todos.find((todo) => !todo.done));',
    'const name = useSelector((state) => state.user.name.slice(0, 8));',
    'const pair = useSelector((state) => ({ a: state.a, b: state.b }), shallowEqual);',
    'const open = useSelector(selectOpenTodos);',
    'const open = useAppSelector(selectOpenTodos);',
    'const pair = useShallowSelector((state) => ({ a: state.a, b: state.b }));',
    'const pair = useCalendarStore(useShallow((state) => ({ a: state.startHour, b: state.endHour })));',
    'const pair = useCalendarStore((state) => ({ a: state.startHour }), shallow);',
    'const hour = useCalendarStore((state) => state.startHour);',
    'const pair = useShallowStore((state) => ({ a: state.startHour, b: state.endHour }));',
    'const pair = useBarrelShallow((state) => ({ a: state.startHour, b: state.endHour }));',
    'const pair = useWrappedStore((state) => ({ a: state.items }));',
    'const pair = useOtherStore((state) => ({ a: state.items }));',
    'const pair = useUnknownStore((state) => ({ a: state.items }));',
    'const pair = useReduxStore((state) => ({ a: state.items }));',
    'const items = useStore(store, (state) => state.items);',
    'const items = useStore(store, (state) => state.items.filter(Boolean), shallow);',
    'const items = useStore((state) => ({ a: state.items }));',
    'const sorted = useSelector((state) => { const copy = state.todos; return copy; });',
    'function inner() { const useSelector = pick; return useSelector((state) => ({ a: state.a })); }',
  ].map((body) => ({ filename, code: inPanel(body) })),
  invalid: [
    selector(
      'const all = useSelector((state) => Object.values(state.byId));',
      'reduxSelector',
      'the new array from `Object.values(...)`',
    ),
    selector(
      'const all = useSelector((state) => Object.entries(state.byId));',
      'reduxSelector',
      'the new array from `Object.entries(...)`',
    ),
    selector(
      'const all = usePlainStore((state) => state.items.toReversed());',
      'zustandSelector',
      'the new array from `.toReversed(...)`',
    ),
    selector(
      'const all = usePlainStore((state) => state.items.flatMap((item) => item.tags));',
      'zustandSelector',
      'the new array from `.flatMap(...)`',
    ),
    selector(
      'const pair = useSelector((state) => ({ a: state.a, b: state.b }));',
      'reduxSelector',
      'a new object',
    ),
    selector(
      'const open = useSelector((state: RootState) => state.todos.filter((todo) => !todo.done));',
      'reduxSelector',
      'the new array from `.filter(...)`',
    ),
    selector(
      'const ids = useSelector((state) => Object.keys(state.byId));',
      'reduxSelector',
      'the new array from `Object.keys(...)`',
    ),
    selector(
      'const open = useSelector(function (state) { if (!state.ready) { return undefined; } return state.todos?.map((todo) => todo.id); });',
      'reduxSelector',
      'the new array from `.map(...)`',
    ),
    selector(
      'const pair = useAppSelector((state) => [state.a, state.b]);',
      'reduxSelector',
      'a new array',
    ),
    selector(
      'const pair = useTypedSelector((state) => ({ ...state.settings }));',
      'reduxSelector',
      'a new object',
    ),
    selector(
      'const pair = useLocalSelector((state) => ({ a: state.a }) as Pair);',
      'reduxSelector',
      'a new object',
    ),
    selector(
      'const { startHour, endHour } = useCalendarStore((state) => ({ startHour: state.startHour, endHour: state.endHour }));',
      'zustandSelector',
      'a new object',
    ),
    selector(
      'const items = usePlainStore((state) => state.items.toSorted(byName));',
      'zustandSelector',
      'the new array from `.toSorted(...)`',
    ),
    selector(
      'const pair = useCalendar((state) => ({ a: state.startHour }));',
      'zustandSelector',
      'a new object',
    ),
    selector(
      'const pair = useRenamedStore((state) => ({ a: state.items }));',
      'zustandSelector',
      'a new object',
    ),
    selector(
      'const pair = useLocalStore((state) => ({ a: state.items }));',
      'zustandSelector',
      'a new object',
    ),
    selector(
      'const items = useStore(store, (state) => Object.fromEntries(state.items));',
      'zustandSelector',
      'the new object from `Object.fromEntries(...)`',
    ),
  ],
});
