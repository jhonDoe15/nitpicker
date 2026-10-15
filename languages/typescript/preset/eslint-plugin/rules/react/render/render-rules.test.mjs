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
    "document.getElementById('root');",
    "export function readRoot() { return document.querySelector('#root'); }",
    "export const el = document.getElementById('app'); el.innerHTML = '';",
    "export function set(el) { el.innerHTML = '<b/>'; el.style.color = 'red'; el.classList.add('x'); }",
  ].map(valid),
  invalid: [
    invalid(inPanel("document.getElementById('banner');"), { messageId: 'directDom' }),
    invalid(inPanel("document.querySelector('.x');"), { messageId: 'directDom' }),
    invalid(inPanel("document.querySelectorAll('.x');"), { messageId: 'directDom' }),
    invalid(inPanel("document.getElementsByClassName('x');"), { messageId: 'directDom' }),
    invalid(inPanel("document.getElementsByTagName('x');"), { messageId: 'directDom' }),
    invalid(inPanel("document.getElementsByName('x');"), { messageId: 'directDom' }),
    invalid(inPanel("ref.current.innerText = 'direct';"), { messageId: 'directDom' }),
    invalid(inPanel("el.innerHTML = '<b/>';"), { messageId: 'directDom' }),
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
      'function useThing(onChange, value) { useEffect(() => { onChange(value); }, [value]); }',
      {
        messageId: 'effectEvent',
      },
    ),
  ],
});
