import { rule as reactNoDirectDom } from './react-no-direct-dom.mjs';
import { rule as reactNoEffectEventHandling } from './react-no-effect-event-handling.mjs';
import { rule as reactNoRandomKey } from './react-no-random-key.mjs';
import { createReactRuleTester, filename } from '../tester.mjs';

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
  ]
    .map(valid)
    .concat(
      [
        "document.getElementById('root');",
        "export function readRoot() { return document.querySelector('#root'); }",
        "export const el = document.getElementById('app'); el.innerHTML = '';",
        "export function set(el) { el.innerHTML = '<b/>'; el.style.color = 'red'; el.classList.add('x'); }",
      ].map((code) => ({ filename: '/repo/src/main/adapters/dom.ts', code })),
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
    inPanel('useEffect(() => { onSave(); });'),
    inPanel('useEffect(() => { onSave(); }, deps);'),
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
  ],
});
