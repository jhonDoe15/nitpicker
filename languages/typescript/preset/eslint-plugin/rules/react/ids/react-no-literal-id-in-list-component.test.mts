import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';
import { temporaryProjects } from '../../../../eslint-config/react/test-support/react-projects.mts';
import { createReactRuleTester, filename } from '../test-support/tester.mts';
import { rule } from './react-no-literal-id-in-list-component.mts';

const tester = createReactRuleTester();
const projects = temporaryProjects();
afterAll(() => {
  projects.removeProjects();
});

function projectFile(name: string, others: Record<string, string> = {}) {
  const root = projects.projectWith('{"name":"app"}');
  mkdirSync(path.join(root, 'src'));
  for (const [file, text] of Object.entries(others)) {
    writeFileSync(path.join(root, 'src', file), text);
  }
  return path.join(root, 'src', name);
}

const row = `export const Row = ({ item }) => (
  <><label htmlFor="group-dn">DN</label><input id="group-dn" /></>
);`;
const defaultRow = `export default function Row() { return <><label htmlFor="dn">D</label><input id="dn" /></>; }`;
const list = `import { Row } from './row';
export const List = ({ items }) => <ul>{items.map((item) => <Row key={item.id} item={item} />)}</ul>;`;
const dispatch = `import { Row } from './row';
export const Stack = ({ stack }) =>
  stack.map((m) => {
    switch (m.name) {
      case 'row': return <Row key={m.id} />;
      default: return null;
    }
  });`;
const single = `import { Row } from './row';
export const Page = () => <Row item={one} />;`;

function inFile(code: string) {
  return { filename, code };
}

tester.run('react-no-literal-id-in-list-component', rule, {
  valid: [
    `const Row = ({ item }) => <><label htmlFor="a">A</label><input id="a" /></>;
     const Page = () => <Row item={one} />;`,
    `const Row = ({ item }) => <><label htmlFor="a">A</label><input id="a" /></>;
     const List = ({ items }) => items.map((item) => <div key={item.id}>{item.name}</div>);`,
    `const Row = ({ item }) => { const id = useId(); return <><label htmlFor={id}>A</label><input id={id} /></>; };
     const List = ({ items }) => items.map((item) => <Row key={item.id} item={item} />);`,
    `const Row = ({ item }) => <><label htmlFor={\`a-\${item.id}\`}>A</label><input id={\`a-\${item.id}\`} /></>;
     const List = ({ items }) => items.map((item) => <Row key={item.id} item={item} />);`,
    `const Row = ({ item }) => <input id="a" />;
     const List = ({ items }) => items.map((item) => <Row key={item.id} item={item} />);`,
    `const Row = ({ item }) => <><label htmlFor="b">A</label><input id="a" /></>;
     const List = ({ items }) => items.map((item) => <Row key={item.id} item={item} />);`,
    `const Row = ({ item, id }) => <><label htmlFor={id}>A</label><input id={id} /></>;
     const List = ({ items }) => items.map((item) => <Row key={item.id} item={item} id={item.id} />);`,
    `const List = ({ items }) => items.map((item) => <Row key={item.id} item={item} />);
     const Other = () => <><label htmlFor="a">A</label><input id="a" /></>;`,
    { filename: projectFile('row.tsx', { 'row.tsx': row, 'page.tsx': single }), code: row },
    {
      filename: projectFile('row.tsx', { 'row.tsx': row, 'stack.tsx': dispatch }),
      code: row,
    },
    inFile(`const Row = () => <><label htmlFor="a">A</label><input id="a" /></>;
     const Stack = ({ stack }) => stack.map((m) => { switch (m.name) { case 'x': return <Row key={m.id} />; } });`),
    inFile(`const Row = () => <><label htmlFor="a">A</label><input id="a" /></>;
     const Stack = ({ stack }) => stack.map((m) => m.name === 'x' ? <Row key={m.id} /> : null);`),
    {
      filename: projectFile('row.tsx', {
        'row.tsx': row,
        'list.tsx':
          'import { Row } from "./other"; export const L = ({ i }) => i.map((x) => <Row />);',
      }),
      code: row,
    },
    {
      filename: projectFile('row.tsx', {
        'row.tsx': row,
        'list.tsx': 'import { Row } from "./row"; export const L = () => <Row />;',
      }),
      code: row,
    },
  ].map((entry) => (typeof entry === 'string' ? inFile(entry) : entry)),
  invalid: [
    {
      ...inFile(`const Row = ({ item }) => <><label htmlFor="grafana-admin">A</label><input id="grafana-admin" /></>;
        const List = ({ items }) => items.map((item) => <Row key={item.id} item={item} />);`),
      errors: [{ messageId: 'literalId', data: { id: 'grafana-admin' } }],
    },
    {
      ...inFile(`function Row({ index }) { return <><label htmlFor="org-id">Org</label><input id="org-id" /></>; }
        const List = ({ rows }) => Array.from(rows, (r) => <Row key={r.id} index={r.id} />);`),
      errors: [{ messageId: 'literalId', data: { id: 'org-id' } }],
    },
    {
      ...inFile(`const Row = () => <><span id="hint">Hint</span><input aria-describedby="hint" id={useId()} /></>;
        const List = ({ items }) => items.flatMap((item) => [<Row key={item.id} />]);`),
      errors: [{ messageId: 'literalId', data: { id: 'hint' } }],
    },
    {
      ...inFile(`const Row = () => {
          useEffect(() => { document.getElementById("panel")?.focus(); });
          return <div id={"panel"} />;
        };
        const List = ({ items }) => items.map((item) => <Row key={item.id} />);`),
      errors: [{ messageId: 'literalId', data: { id: 'panel' } }],
    },
    {
      ...inFile(`const Row = memo(() => <><label htmlFor="n-switch">N</label><Switch id="n-switch" /></>);
        const List = ({ items }) => items.map((item) => <Row key={item.id} />);`),
      errors: [{ messageId: 'literalId', data: { id: 'n-switch' } }],
    },
    {
      filename: projectFile('row.tsx', { 'row.tsx': row, 'list.tsx': list }),
      code: row,
      errors: [{ messageId: 'literalId', data: { id: 'group-dn' } }],
    },
    {
      filename: projectFile('row.tsx', {
        'row.tsx': defaultRow,
        'list.tsx': `import Item from './row';
export const L = ({ items }) => items.map((x) => <Item key={x} />);`,
      }),
      code: defaultRow,
      errors: [{ messageId: 'literalId', data: { id: 'dn' } }],
    },
  ],
});
