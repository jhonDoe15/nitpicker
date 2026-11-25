import { createReactRuleTester, filename } from '../test-support/tester.mts';
import { rule } from './react-pure-state-updater.mts';

const tester = createReactRuleTester();
const updater = 'a state updater';
const reducer = 'a reducer';

function inPanel(body: string) {
  return `import { useReducer, useState } from 'react';
function external(state, action) { return { ...state, count: state.count + action.by }; }
export function Panel({ item, onChange, format }) {
  const [items, setItems] = useState<string[]>([]);
  const [tags, setTags] = useState(new Set<string>());
  const [byId, setById] = useState(() => new Map());
  const [form, setForm] = useState({ name: '', open: false });
  const [when, setWhen] = useState(start);
  const [count, setCount] = useState(0);
  ${body}
  return <button type="button" onClick={run}>{items.length + count + tags.size + byId.size}{form.name}{String(when)}</button>;
}`;
}

function valid(body: string) {
  return { filename, code: inPanel(body) };
}

function invalid(
  body: string,
  ...errors: readonly (readonly ['nestedUpdate' | 'propCallback' | 'mutation', string, string?])[]
) {
  return {
    filename,
    code: inPanel(body),
    errors: errors.map(([messageId, name, where]) => ({
      messageId,
      data: { name, where: where ?? updater },
    })),
  };
}

tester.run('react-pure-state-updater', rule, {
  valid: [
    'const run = () => { setItems((current) => [...current, item]); setCount((current) => current + 1); };',
    'const run = () => { const next = [...items, item]; setItems(next); setCount(next.length); onChange(next); };',
    'const run = () => { setItems((current) => { console.log(current); return current.filter(Boolean); }); };',
    'const run = () => { setItems((current) => current.toSorted()); };',
    'const run = () => { setItems((current) => current.map((each) => format(each))); };',
    'const run = () => { setItems((current) => { const next = [...current]; next.push(item); return next; }); };',
    'const run = () => { setItems((current) => { current = [...current]; current.push(item); return current; }); };',
    'const run = () => { setWhen((current) => current.add(1, "month")); };',
    'const run = () => { setWhen((current) => current.set("hour", 0)); };',
    'const run = () => { setForm((current) => current.push(item)); };',
    'const run = () => { setTags((current) => new Set(current).add(item)); };',
    'const run = () => { setById((current) => new Map(current).set(item, 1)); };',
    'const run = () => { setItems((current) => { setTimeout(() => { setCount(current.length); }, 0); return current; }); };',
    'const run = () => { setCount((current) => format(current)); };',
    'const run = () => { setItems((current) => { const label = format(item); return [...current, label]; }); };',
    'const [params, setParams] = useSearchParams(); const run = () => { setParams((current) => { current.set("q", item); return current; }); };',
    'const [draft, setDraft] = useImmer({ open: false }); const run = () => { setDraft((current) => { current.open = true; }); };',
    'const run = () => { setForm(produce((draft) => { draft.open = true; })); };',
    'const [state, dispatch] = useReducer(external, { count: 0 }); const run = () => { dispatch({ by: 1 }); };',
    'const [state, dispatch] = useReducer(produce((draft, action) => { draft.count += action.by; }), { count: 0 }); const run = () => { dispatch({ by: 1 }); };',
    'const [state, dispatch] = useImmerReducer((draft, action) => { draft.count += action.by; }, { count: 0 }); const run = () => { dispatch({ by: 1 }); };',
    'const [state, dispatch] = useReducer((current, action) => current.push(action), start); const run = () => { dispatch(item); };',
  ].map(valid),
  invalid: [
    invalid(
      'const run = () => { setItems((current) => { setCount(current.length + 1); return [...current, item]; }); };',
      ['nestedUpdate', 'setCount'],
    ),
    invalid(
      'const run = () => { setCount((current) => { if (current === 1) { setForm({ name: "", open: false }); } return current + 1; }); };',
      ['nestedUpdate', 'setForm'],
    ),
    invalid(
      'const [state, dispatch] = useReducer(external, { count: 0 }); const run = () => { setCount((current) => { dispatch({ by: current }); return current + 1; }); };',
      ['nestedUpdate', 'dispatch'],
    ),
    invalid(
      'const run = () => { setItems((current) => { const next = [...current, item]; onChange(next); return next; }); };',
      ['propCallback', 'onChange'],
    ),
    invalid(
      'const run = () => { setItems((current) => { const next = [...current, item]; onChange?.(next); return next; }); };',
      ['propCallback', 'onChange'],
    ),
    invalid('const run = () => { setForm((state) => { state.count++; return state; }); };', [
      'mutation',
      'state',
    ]),
    invalid(
      'const [seen, setSeen] = useState<Set<string> | undefined>(); const run = () => { setSeen((current) => current?.add(item)); };',
      ['mutation', 'current'],
    ),
    invalid(
      'const run = () => { setItems((current) => { current.push(item); return current; }); };',
      ['mutation', 'current'],
    ),
    invalid('const run = () => { setItems((current) => current.splice(0, 1)); };', [
      'mutation',
      'current',
    ]),
    invalid(
      'const run = () => { setItems((current) => { current.sort(); return [...current]; }); };',
      ['mutation', 'current'],
    ),
    invalid('const run = () => { setTags((current) => new Set(current.add(item))); };', [
      'mutation',
      'current',
    ]),
    invalid(
      'const run = () => { setById((current) => { current.delete(item); return current; }); };',
      ['mutation', 'current'],
    ),
    invalid('const run = () => { setForm((state) => { state.open = true; return state; }); };', [
      'mutation',
      'state',
    ]),
    invalid(
      'const run = () => { setForm((state) => { delete state.name; return { ...state }; }); };',
      ['mutation', 'state'],
    ),
    invalid(
      'const run = () => { setCount(function (value) { value.total.sum += 1; return value; }); };',
      ['mutation', 'value'],
    ),
    invalid(
      'const [state, dispatch] = useReducer((current, action) => { current.count += action.by; return current; }, { count: 0 }); const run = () => { dispatch({ by: 1 }); };',
      ['mutation', 'current', reducer],
    ),
    invalid(
      'function local(list: string[], action) { list.push(action); return list; } const [state, dispatch] = useReducer(local, []); const run = () => { dispatch(item); };',
      ['mutation', 'list', reducer],
    ),
    invalid(
      'const local = (current, action) => { setCount(action.by); return current; }; const [state, dispatch] = useReducer(local, 0); const [other, send] = useReducer(local, 0); const run = () => { dispatch(item); send(item); };',
      ['nestedUpdate', 'setCount', reducer],
    ),
  ],
});

tester.run('react-pure-state-updater props object', rule, {
  valid: [
    {
      filename,
      code: `import { useState } from 'react';
import { Map, Set } from 'immutable';
export function Panel({ item }) {
  const [byId, setById] = useState<Map<string, number>>(Map());
  const [tags, setTags] = useState(new Set());
  const add = () => {
    setById((current) => current.set(item, 1));
    setTags((current) => current.add(item));
  };
  return <button type="button" onClick={add}>{byId.size + tags.size}</button>;
}`,
    },
    {
      filename,
      code: `import { useState } from 'react';
export function Panel(props) { const [n, setN] = useState(0);
  return <button type="button" onClick={() => { setN((current) => props.step(current)); }}>{n}</button>; }`,
    },
    {
      filename,
      code: `import { useState } from 'react';
export function usePanel(notify) { const [n, setN] = useState(0);
  return () => { setN((current) => { notify(current); return current + 1; }); }; }`,
    },
  ],
  invalid: [
    {
      filename,
      code: `import { useState } from 'react';
export const Panel = (props) => { const [n, setN] = useState(0);
  const step = () => { setN((current) => { props.onStep(current); return current + 1; }); };
  return <button type="button" onClick={step}>{n}</button>; };`,
      errors: [{ messageId: 'propCallback', data: { name: 'props.onStep', where: updater } }],
    },
  ],
});
