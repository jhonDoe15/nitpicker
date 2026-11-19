import { createReactRuleTester, filename } from '../test-support/tester.mts';
import { rule } from './react-effect-needs-dependencies.mts';

const tester = createReactRuleTester();

function inPanel(body: string, params = '{ filter, setFilterValues, onChange }') {
  return `import { useEffect, useLayoutEffect, useState, useReducer, useRef } from 'react';
export function Panel(${params}) {
  const [value, setValue] = useState(0);
  const [state, dispatch] = useReducer(reducer, 0);
  const previous = useRef(filter);
  ${body}
  return <div />;
}`;
}

function valid(body: string, params?: string) {
  return { filename, code: inPanel(body, params) };
}

function invalid(body: string, name: string, params?: string) {
  return {
    filename,
    code: inPanel(body, params),
    errors: [{ messageId: 'noDependencies' as const, data: { name } }],
  };
}

tester.run('react-effect-needs-dependencies', rule, {
  valid: [
    'const { setPage } = loadParams(); useEffect(() => { setPage(1); });',
    'const { page } = useListParams(); useEffect(() => { console.log(page); });',
    'useEffect(() => { setValue(filter); }, [filter]);',
    'useEffect(() => { setValue(1); }, []);',
    'useEffect(() => { document.title = String(value); });',
    'useEffect(() => { previous.current = filter; });',
    'useEffect(() => { console.log(value); });',
    'useLayoutEffect(() => { console.log(ref.current.offsetHeight); });',
    'useEffect(() => { const id = setTimeout(() => setValue(1), 10); return () => clearTimeout(id); });',
    'useEffect(() => { window.addEventListener("resize", () => setValue(1)); });',
    'useEffect(async () => { setValue(await load()); });',
    'useEffect(() => { onChange(filter); });',
    'useEffect(() => { setOther(filter); });',
    'useEffect(() => { notify(filter); });',
    'const setLocal = (x) => x; useEffect(() => { setLocal(1); });',
    'useEffect(() => { return () => setValue(0); });',
    'const [first] = useState(0); useEffect(() => { first(); });',
    'useEffect(setup);',
    'other(() => { setValue(1); });',
    'useEffect(() => { setValue(1); }, deps);',
    'useEffect(() => { if (a) { setValue(1); } else { setValue(2); } });',
    'useEffect(() => { if (!isEqual(filter, previous.current)) setValue(filter); });',
    'useEffect(() => { ok && setValue(1); });',
    'useLayoutEffect(() => { setValue(ref.current.offsetHeight); });',
    `const { setFilterValues: setFilters } = useListParams(); const filterRef = useRef(filter);
     useEffect(() => { if (!isEqual(filter, filterRef.current)) { setFilters(filter); } });`,
    'const run = () => setValue(1); useEffect(() => { run(); });',
  ].map((body) => valid(body)),
  invalid: [
    invalid('const { setPage } = useListParams(); useEffect(() => { setPage(1); });', 'setPage'),
    invalid('useEffect(() => { setValue(1); });', 'setValue'),
    invalid('useLayoutEffect(() => { setValue(compute()); });', 'setValue'),
    invalid('useEffect(function () { dispatch({ type: "reset" }); });', 'dispatch'),
    invalid('useEffect(() => { setFilterValues(filter); });', 'setFilterValues'),
    invalid('useEffect(() => { setFilterValues(filter); setValue(2); });', 'setFilterValues'),
    invalid('React.useEffect(() => { setValue(1); });', 'setValue'),
    invalid('useEffect(() => { log(a); if (a) { x(); } setValue(2); });', 'setValue'),
    invalid(
      'useEffect(() => { const { setFilterValues } = props; setFilterValues(filter); });',
      'setFilterValues',
      'props',
    ),
  ],
});
