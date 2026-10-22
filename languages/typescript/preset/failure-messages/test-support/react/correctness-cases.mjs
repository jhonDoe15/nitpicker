import { panel } from './react-case.mjs';

function listPanel(row) {
  return `export const List = ({ items }) => <ul>{items.map((item) => ${row})}</ul>;`;
}

function stateful(body) {
  return panel(`const [list, setList] = useState([]); ${body}`);
}

const cases = [
  [
    'state mutation names a copy',
    stateful('list.push(1); setList(list);'),
    'setList([...list, item])',
  ],
  ['prop sort names toSorted', panel('const sorted = items.sort();'), 'items.toSorted()'],
  [
    'time in render names props or an effect',
    panel('const now = Date.now();'),
    'event handler or an effect',
  ],
  [
    'set state in render names an event handler',
    stateful('setList([]);'),
    'event handler or an effect',
  ],
  [
    'ref in render names handlers and effects',
    panel('const ref = useRef(0); const v = ref.current;'),
    'ref.current',
  ],
  [
    'nested component names module level',
    panel('function Inner() { return <i />; } return <Inner />;'),
    'module level',
  ],
  [
    'nested lazy component names module level',
    panel("const Chart = lazy(() => import('./chart.js'));"),
    'lazy(...)',
  ],
  ['missing key names a stable id', listPanel('<li>{item}</li>'), 'stable id from the item'],
  [
    'duplicate key names a distinct id',
    "export const List = () => <ul><li key='a' /><li key='a' /></ul>;",
    'distinct stable id',
  ],
  [
    'context value object names useMemo',
    'export const P = ({ children }) => <Ctx.Provider value={{ a: 1 }}>{children}</Ctx.Provider>;',
    'useMemo',
  ],
  [
    'default prop literal names a module-level constant',
    'export const P = ({ items = [] }) => <ul>{items}</ul>;',
    'module-level constant',
  ],
  [
    'forwardRef names the ref prop',
    'export const P = forwardRef((props, ref) => <div ref={ref} />);',
    '`ref` as a prop',
  ],
  [
    'context provider names the context element',
    "import { createContext } from 'react'; const ThemeContext = createContext(1); export const P = ({ children }) => <ThemeContext.Provider value={1}>{children}</ThemeContext.Provider>;",
    '<Context value={...}>',
  ],
];

export const correctnessCases = cases;
