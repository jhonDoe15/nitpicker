import { rule as reactNoDirectDom } from './react-no-direct-dom.mjs';
import { rule as reactNoEffectEventHandling } from './react-no-effect-event-handling.mjs';
import { rule as reactNoRandomKey } from './react-no-random-key.mjs';
import { createReactRuleTester, filename } from '../test-support/tester.mjs';

const tester = createReactRuleTester();

function valid(code) {
  return { filename, code };
}

function invalid(code, ...errors) {
  return { filename, code, errors };
}

function inPanel(body) {
  return `export function Panel({ items, onSave, onClose }) { ${body} return <div />; }`;
}

tester.run('react-no-random-key', reactNoRandomKey, {
  valid: [
    '<li key={item.id} />',
    '<li key="static" />',
    '<li key={`${item.id}-${item.version}`} />',
    '<li key={JSON.stringify(item)} />',
    '<li key={item.id} data-x={Math.random()} />',
    '<li key={item.id}>{Math.random()}</li>',
    '<li key={item.id} render={() => uuid()} />',
    '<li id={Math.random()} />',
    '<li key={String(random())} />',
    '<li key={obj.random()} />',
    '<li key={other.now()} />',
    '<li key={Math.floor(1)} />',
    '<li key={items[0]()} />',
    '<li key={makeKey()} />',
    'const id = nanoid(); export const Row = () => <li key={id} />;',
    'export function Row() { let id = nanoid(); id = item.id; return <li key={id} />; }',
    'export function Row({ item }) { const id = item.id; return <li key={id} />; }',
    "import { v4 } from './ids'; export const Row = () => <li key={v4()} />;",
    'function uuid() { return 1; } export const Row = () => <li key={uuid()} />;',
    '<li key={new Date(item.createdAt).getTime()} />',
    'export function Row({ item }) { const key = `${item.id}-${item.version}`; return <li key={key} />; }',
    'export function Row({ item }) { const key = items.map(() => Math.random()); return <li key={key} />; }',
  ].map(valid),
  invalid: [
    invalid('<li key={Math.random()} />', {
      messageId: 'randomKey',
      data: { call: 'Math.random' },
    }),
    invalid('<li key={Date.now()} />', { messageId: 'randomKey', data: { call: 'Date.now' } }),
    invalid('<li key={performance.now()} />', { messageId: 'randomKey' }),
    invalid('<li key={crypto.randomUUID()} />', {
      messageId: 'randomKey',
      data: { call: 'crypto.randomUUID' },
    }),
    invalid('<li key={randomUUID()} />', { messageId: 'randomKey', data: { call: 'randomUUID' } }),
    invalid('<li key={uuid()} />', { messageId: 'randomKey' }),
    invalid('<li key={uuidv4()} />', { messageId: 'randomKey' }),
    invalid('<li key={v4()} />', { messageId: 'randomKey' }),
    invalid('<li key={nanoid()} />', { messageId: 'randomKey' }),
    invalid('<li key={cuid()} />', { messageId: 'randomKey' }),
    invalid('<li key={createId()} />', { messageId: 'randomKey' }),
    invalid('<li key={`${item.id}-${Math.random()}`} />', { messageId: 'randomKey' }),
    invalid('<li key={String(Date.now())} />', { messageId: 'randomKey' }),
    invalid('<li key={Math.random()} id={Math.random()} />', { messageId: 'randomKey' }),
    invalid('export function Row() { const id = crypto.randomUUID(); return <li key={id} />; }', {
      messageId: 'randomKey',
      data: { call: 'crypto.randomUUID' },
    }),
    invalid(
      'export function List({ items }) { const id = uuid(); return items.map((item) => <li key={id}>{item}</li>); }',
      { messageId: 'randomKey', data: { call: 'uuid' } },
    ),
    invalid("import * as uuid from 'uuid'; export const Row = () => <li key={uuid.v4()} />;", {
      messageId: 'randomKey',
      data: { call: 'uuid.v4' },
    }),
    invalid(
      "import { v4 as makeId } from 'uuid'; export const Row = () => <li key={makeId()} />;",
      {
        messageId: 'randomKey',
        data: { call: 'makeId' },
      },
    ),
    invalid(
      "import { randomUUID } from 'node:crypto'; export const Row = () => <li key={randomUUID()} />;",
      {
        messageId: 'randomKey',
      },
    ),
    invalid('<li key={window.crypto.randomUUID()} />', {
      messageId: 'randomKey',
      data: { call: 'window.crypto.randomUUID' },
    }),
    invalid('<li key={new Date().getTime()} />', {
      messageId: 'randomKey',
      data: { call: 'new Date' },
    }),
    invalid(
      'export function Row({ name }) { const key = `${name}-${String(Math.random())}`; return <li key={key} />; }',
      { messageId: 'randomKey', data: { call: 'Math.random' } },
    ),
  ],
});

tester.run('react-no-direct-dom', reactNoDirectDom, {
  valid: [
    inPanel('const ref = useRef(null); const focus = () => ref.current?.focus();'),
    inPanel('const rect = ref.current.getBoundingClientRect();'),
    inPanel('const item = items.querySelector("a");'),
    inPanel('const find = registry.getElementById("a");'),
    inPanel('document.title = "x";'),
    inPanel('const style = { color: "red" };'),
    inPanel('const list = classList.add(1);'),
    inPanel('state.classList.contains("a");'),
    inPanel('model.name = "x";'),
    inPanel('document[query]("a");'),
    inPanel('document.createElement("a");'),
    inPanel('model.style = "x";'),
    "const root = document.getElementById('root'); if (root) { createRoot(root).render(<App />); }",
    "ReactDOM.hydrateRoot(document.querySelector('#app'), <App />);",
    inPanel('canvasRef.current.style.width = `${width}px`;'),
    inPanel('ref.current?.classList.add("open");'),
    inPanel('const canvas = canvasRef.current; canvas.style.height = "10px";'),
    inPanel('document.documentElement.classList.toggle("dark", dark);'),
    inPanel('document.body.style.overflow = "hidden";'),
    inPanel('window.document.body.className = "locked";'),
    inPanel(
      'const data = new FormData(); data.append("a", "b"); span.setAttribute("http.status", 200);',
    ),
    inPanel(
      'ref.current?.appendChild(chart.element); ref.current?.setAttribute("aria-busy", "true");',
    ),
    inPanel('document.documentElement.setAttribute("data-theme", theme);'),
    inPanel(
      'const node = ref.current; node.style.setProperty("--x", "1px"); Object.assign(node.style, s);',
    ),
    inPanel('const a = document.createElement("a"); a.href = url; a.click();'),
    inPanel('function f(document) { document.querySelector("a"); }'),
    inPanel('Object.assign(target, { color });'),
    "const target = document.getElementById('modal'); export const Modal = ({ children }) => createPortal(children, target);",
  ]
    .map(valid)
    .concat(
      [
        "document.getElementById('root');",
        "export function readRoot() { return document.querySelector('#root'); }",
        "export const el = document.getElementById('app'); el.innerHTML = '';",
      ].map((code) => ({ filename: '/repo/src/main/domain/dom.ts', code })),
    ),
  invalid: [
    invalid(inPanel("document.getElementById('banner');"), { messageId: 'directDom' }),
    invalid(inPanel("document.querySelector('.x');"), { messageId: 'directDom' }),
    invalid(inPanel("document.querySelectorAll('.x');"), { messageId: 'directDom' }),
    invalid(inPanel("document.getElementsByClassName('x');"), { messageId: 'directDom' }),
    invalid(inPanel("document.getElementsByTagName('x');"), { messageId: 'directDom' }),
    invalid(inPanel("document.getElementsByName('x');"), { messageId: 'directDom' }),
    invalid(inPanel("ref.current.innerText = 'direct';"), { messageId: 'directDom' }),
    invalid(inPanel("el.innerHTML = '<b/>';"), { messageId: 'directDom' }),
    invalid(
      "const root = document.getElementById('root'); root.className = 'x'; createRoot(root).render(<App />);",
      { messageId: 'directDom' },
    ),
    invalid("document.getElementById('banner'); createRoot.name; export const P = () => <i />;", {
      messageId: 'directDom',
    }),
    invalid(inPanel("el.outerHTML = '<b/>';"), { messageId: 'directDom' }),
    invalid(inPanel("el.textContent = 'x';"), { messageId: 'directDom' }),
    invalid(inPanel("el.className = 'x';"), { messageId: 'directDom' }),
    invalid(inPanel("el.style.color = 'red';"), { messageId: 'directDom' }),
    invalid(inPanel("el.classList.add('y');"), { messageId: 'directDom' }),
    invalid(inPanel("el.classList.remove('y');"), { messageId: 'directDom' }),
    invalid(inPanel("el.classList.toggle('y');"), { messageId: 'directDom' }),
    invalid(inPanel("el.classList.replace('y', 'z');"), { messageId: 'directDom' }),
    invalid(
      inPanel("document.querySelector('.x')?.classList.add('y');"),
      {
        messageId: 'directDom',
      },
      { messageId: 'directDom' },
    ),
    invalid("function setup(el) { el.innerHTML = 'x'; } export const A = () => <div />;", {
      messageId: 'directDom',
    }),
    invalid(inPanel("window.document.querySelector('.x');"), { messageId: 'directDom' }),
    invalid(inPanel("globalThis.document.getElementById('x');"), { messageId: 'directDom' }),
    invalid(inPanel("document.body.innerHTML = '';"), { messageId: 'directDom' }),
    ...[
      inPanel("ref.current?.insertAdjacentHTML('beforeend', html);"),
      inPanel("const doc = document; doc.querySelector('.banner');"),
      inPanel("const doc = window.document; const root = doc; root.getElementById('x');"),
      inPanel("el.style.setProperty('background', color);"),
      inPanel('Object.assign(el.style, { color });'),
      inPanel("const element = document.createElement('div'); element.append(text);"),
      inPanel('document.body.appendChild(element);'),
      inPanel("const node = document.createElement('a'); node.removeAttribute('hidden');"),
    ].map((code) => invalid(code, { messageId: 'directDom' })),
    invalid(
      inPanel("const node = document.querySelector('.a'); node?.setAttribute('class', 'x');"),
      { messageId: 'directDom' },
      { messageId: 'directDom' },
    ),
    ...[
      "export function set(el) { el.innerHTML = '<b/>'; }",
      "export function readRoot() { return document.querySelector('#root'); }",
    ].map((code) => ({
      filename: '/repo/src/main/features/x/adapters/dom.ts',
      code,
      errors: [{ messageId: 'directDom' }],
    })),
    ...['/repo/src/main/ui/banner.ts', '/repo/src/main/adapters/use-banner.ts'].map((path) => ({
      filename: path,
      code: "export function hide() { document.querySelector('.banner')?.remove(); }",
      errors: [{ messageId: 'directDom' }],
    })),
  ],
});

tester.run('react-no-effect-event-handling', reactNoEffectEventHandling, {
  valid: [
    inPanel('useEffect(() => { onSave(); }, []);'),
    inPanel('useEffect(() => { save(); }, [items]);'),
    inPanel('useEffect(() => { onsave(); }, [items]);'),
    inPanel('useEffect(() => { Save(); }, [items]);'),
    inPanel(
      'useEffect(() => { const run = () => onSave(); window.addEventListener("x", run); return () => window.removeEventListener("x", run); }, [items]);',
    ),
    inPanel('useEffect(() => { setTimeout(() => onSave(), 10); }, [items]);'),
    inPanel('const submit = () => { onSave(items); };'),
    inPanel('useMemo(() => { onSave(); }, [items]);'),
    inPanel('useEffect(onSave, [items]);'),
    inPanel('useEffect(() => { local.onSave(); }, [items]);'),
    inPanel('useEffect(() => { props.onSave(); }, [items]);'),
    inPanel('const onLocal = () => 1; useEffect(() => { onLocal(); }, [items]);'),
    inPanel('useEffect(() => { onSave[0](); }, [items]);'),
    inPanel('useEffect(() => { items[onSave](); }, [items]);'),
    inPanel('useEffect(() => { store.onSave(); }, [items]);'),
    inPanel('useEffect(() => { onSave; }, [items]);'),
    inPanel('useCustom(() => { onSave(); }, [items]);'),
    'export function Panel({ onChange: report, save }) { useEffect(() => { save(); }, [report]); return <div />; }',
    'export function Panel({ value, report }) { useEffect(() => { report(value); }, [value]); return <div />; }',
    'export function Panel(props) { const { onSave } = store; useEffect(() => { onSave(); }, [props.value]); return <div />; }',
    'export function Panel(props) { const onSave = props.onSave ?? noop; useEffect(() => { onSave(); }, [props.value]); return <div />; }',
  ].map(valid),
  invalid: [
    invalid(inPanel('useEffect(() => { onSave(items); }, [items, onSave]);'), {
      messageId: 'effectEvent',
      data: { name: 'onSave' },
    }),
    invalid(inPanel('useEffect(() => { if (items.length > 0) { onSave(items); } }, [items]);'), {
      messageId: 'effectEvent',
    }),
    invalid(inPanel('useLayoutEffect(() => { onClose(); }, [items]);'), {
      messageId: 'effectEvent',
      data: { name: 'onClose' },
    }),
    invalid(
      'export function Panel(props) { useEffect(() => { props.onSave(); }, [props.value]); return <div />; }',
      { messageId: 'effectEvent', data: { name: 'onSave' } },
    ),
    invalid(
      inPanel('React.useEffect(() => { onSave(); onClose(); }, [items]);'),
      {
        messageId: 'effectEvent',
      },
      { messageId: 'effectEvent' },
    ),
    invalid(
      'export function Panel(props) { const { onChange, value } = props; useEffect(() => { onChange(value); }, [value]); return <div />; }',
      { messageId: 'effectEvent', data: { name: 'onChange' } },
    ),
    invalid(
      'function useThing(onChange, value) { useEffect(() => { onChange(value); }, [value]); }',
      {
        messageId: 'effectEvent',
      },
    ),
    invalid(inPanel('useEffect(() => { onSave(); });'), {
      messageId: 'effectEvent',
      data: { name: 'onSave' },
    }),
    invalid(inPanel('useEffect(() => { onSave(); }, deps);'), { messageId: 'effectEvent' }),
    invalid(
      'export function Panel({ value, onChange: report }) { useEffect(() => { report(value); }, [value, report]); return <div />; }',
      { messageId: 'effectEvent', data: { name: 'report' } },
    ),
    invalid(
      'export function Panel({ value, onChange: report = noop }) { useEffect(() => { report(value); }, [value]); return <div />; }',
      { messageId: 'effectEvent', data: { name: 'report' } },
    ),
    invalid(
      'export function Panel(props) { const { onChange: report } = props; useEffect(() => { report(); }, [props.value]); return <div />; }',
      { messageId: 'effectEvent', data: { name: 'report' } },
    ),
  ],
});
