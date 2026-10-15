import { exceptionCase, reactCase } from './react-case.mjs';

const cases = [
  [
    'dangerouslySetInnerHTML names JSX',
    'export const P = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;',
    'Render the content as JSX',
  ],
  [
    'button without type names type="button"',
    'export const P = () => <button>go</button>;',
    'type="button"',
  ],
  [
    'target blank names rel',
    "export const P = () => <a href='https://x.dev' target='_blank'>x</a>;",
    'rel="noreferrer noopener"',
  ],
  [
    'javascript url names a button',
    "export const P = () => <a href='javascript:run()'>x</a>;",
    '<button onClick>',
  ],
  [
    'unremoved listener names removeEventListener',
    "export const P = () => { useEffect(() => { window.addEventListener('resize', onResize); }, []); return <i />; };",
    'removeEventListener',
  ],
  [
    'interval without cleanup names clearInterval',
    'export const P = () => { useEffect(() => { setInterval(tick, 1000); }, []); return <i />; };',
    'clearInterval',
  ],
  [
    'timeout without cleanup names clearTimeout',
    'export const P = () => { useEffect(() => { setTimeout(tick, 1000); }, []); return <i />; };',
    'clearTimeout',
  ],
  [
    'resize observer without cleanup names disconnect',
    'export const P = ({ el }) => { useEffect(() => { const o = new ResizeObserver(measure); o.observe(el); }, []); return <i />; };',
    'observer.disconnect()',
  ],
  [
    'unlabelled field names label, htmlFor and aria-label',
    'export const P = () => <input />;',
    'aria-label',
  ],
  [
    'random key names a stable id',
    'export const P = ({ items }) => <ul>{items.map((i) => <li key={Math.random()}>{i}</li>)}</ul>;',
    'stable id from the item',
  ],
  [
    'direct DOM change names state and props',
    "export const P = () => { document.getElementById('banner'); return <i />; };",
    'render the value from state or props',
  ],
  [
    'value with defaultValue names one of them',
    'export const P = () => <input value="a" defaultValue="b" />;',
    'not both',
  ],
  [
    'value without onChange names readOnly',
    'export const P = ({ v }) => <input aria-label="n" value={v} />;',
    'readOnly',
  ],
  [
    'prop callback in an effect names the event handler',
    'export const P = ({ onSave, v }) => { useEffect(() => { onSave(v); }, [v]); return <i />; };',
    'event handler that causes the change',
  ],
  [
    'await in an effect names a query library',
    'export const P = ({ id }) => { useEffect(() => { const run = async () => { await load(id); }; void run(); }, [id]); return <i />; };',
    'useQuery',
  ],
  [
    'icon-only button names the label',
    'export const P = () => <button><svg /></button>;',
    'text label',
  ],
  [
    'ambiguous link text names the context',
    "export const P = () => <a href='/x'>click here</a>;",
    'context',
  ],
];

const exceptionRoutes = [
  ['dangerouslySetInnerHTML', cases[0][1]],
  ['button without type', cases[1][1]],
  ['interval without cleanup', cases[4][1]],
];

export const browserCases = [...cases, ...exceptionRoutes.map(exceptionCase)].map(reactCase);
