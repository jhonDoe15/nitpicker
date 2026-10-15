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
];

const exceptionRoutes = [
  ['dangerouslySetInnerHTML', cases[0][1]],
  ['button without type', cases[1][1]],
  ['interval without cleanup', cases[4][1]],
];

export const browserCases = [...cases, ...exceptionRoutes.map(exceptionCase)].map(reactCase);
