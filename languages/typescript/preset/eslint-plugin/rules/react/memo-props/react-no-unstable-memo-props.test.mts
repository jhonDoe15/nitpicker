import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { createReactRuleTester } from '../test-support/tester.mts';
import { rule } from './react-no-unstable-memo-props.mts';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-memo-props-'));
const compiled = path.join(root, 'compiled');
mkdirSync(path.join(root, 'src/ui'), { recursive: true });
mkdirSync(path.join(compiled, 'src/ui'), { recursive: true });
const plugin = path.join(root, 'plugin');
mkdirSync(path.join(plugin, 'src/ui'), { recursive: true });
writeFileSync(
  path.join(plugin, 'package.json'),
  JSON.stringify({ devDependencies: { 'babel-plugin-react-compiler': '1' } }),
);
writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { react: '19' } }));
writeFileSync(
  path.join(compiled, 'package.json'),
  JSON.stringify({ dependencies: { 'react-compiler-runtime': '1' } }),
);
writeFileSync(
  path.join(root, 'src/ui/rows.tsx'),
  [
    "import React, { memo } from 'react';",
    "import { memo as fakeMemo } from './fake-memo';",
    'function RowImpl(props) { return <li />; }',
    'export const Row = memo(RowImpl);',
    'export const ComparedRow = memo(RowImpl, (a, b) => a.id === b.id);',
    'export const PlainRow = RowImpl;',
    'export const FakeRow = fakeMemo(RowImpl);',
    'const Cell = React.memo(function Cell(props) { return <td />; });',
    'export { Cell as TableCell };',
    'export default memo(RowImpl);',
  ].join('\n'),
);
writeFileSync(path.join(root, 'src/ui/index.ts'), "export { Row as ListRow } from './rows';\n");

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const filename = path.join(root, 'src/ui/list.tsx');
const tester = createReactRuleTester();

const imports = `import { memo, useCallback, useMemo } from 'react';
import * as React from 'react';
import DefaultRow, { Row, ComparedRow, PlainRow, FakeRow, TableCell } from './rows';
import { ListRow } from './index';
import { Button } from 'ui-kit';
const Local = memo(function Local(props) { return <li />; });
const LocalForward = React.memo(React.forwardRef((props, ref) => <li ref={ref} />));
const rowStyle = { height: 32 };
const noop = () => {};`;

function inList(body: string, tail = '') {
  return `${imports}\nexport function List({ items, pick, style }) {\n  ${body}\n}\n${tail}`;
}

const BODY_ADVICE = 'Pass values that stay the same between renders.';
const LIST_ADVICE =
  'Hooks cannot be called in a list callback: pass the item and a handler that stays the same between renders and let the row build the rest, or move the row into its own component that builds these values with the hooks named above.';

function adviceFor(body: string) {
  return /\.map\(|\.flatMap\(|Array\.from\(/u.test(body) ? LIST_ADVICE : BODY_ADVICE;
}

function invalid(body: string, component: string, props: string, tail?: string) {
  return {
    filename,
    code: inList(body, tail),
    errors: [
      { messageId: 'unstableProps' as const, data: { component, props, advice: adviceFor(body) } },
    ],
  };
}

const OBJECT = 'object: move it to module level or build it with `useMemo`';
const ARRAY = 'array: move it to module level or build it with `useMemo`';
const FUNCTION = 'function: wrap it in `useCallback`';
const ELEMENT = 'element: build it with `useMemo`';

tester.run('react-no-unstable-memo-props', rule, {
  valid: [
    'return <Row item={items[0]} style={rowStyle} onPick={noop} />;',
    'const onPick = useCallback((id) => pick(id), [pick]); return <Row onPick={onPick} />;',
    'const rowStyle = useMemo(() => ({ height: 32 }), []); return <Row style={rowStyle} />;',
    'return <Row style={style} onPick={pick} label="one" count={3} />;',
    'return <ComparedRow style={{ height: 32 }} />;',
    'return <PlainRow style={{ height: 32 }} />;',
    'return <FakeRow style={{ height: 32 }} />;',
    'return <Button style={{ height: 32 }} onClick={() => pick(1)} />;',
    'return <Unknown style={{ height: 32 }} />;',
    'return <Row style={{ height: 32 }}><span /></Row>;',
    'return <Row style={{ height: 32 }}>{items.length}</Row>;',
    'return <Row key={{}} ref={(node) => { pick(node); }} />;',
    'return <Row children={[<span key="a" />]} />;',
    'return <Row xlink:href={{ a: 1 }} />;',
    'return <Row style={{ height: 32 }} {...style} />;',
    'const cell = useMemo(() => <Row style={{ height: 32 }} />, []); return cell;',
    'const show = () => { pick(<Row style={{ height: 32 }} />); }; return <button onClick={show} />;',
    'const renderRow = (item) => <Row style={{ height: 32 }} />; return items.map(renderRow);',
    'let onPick = () => pick(1); return <Row onPick={onPick} />;',
    'const { onPick = () => {} } = style; return <Row onPick={onPick} />;',
    'const Inner = memo(function Inner() { return <li />; }); return <Inner style={{ height: 32 }} />;',
  ]
    .map((body) => ({ filename, code: inList(body) }))
    .concat([
      {
        filename,
        code: `${imports}\nconst element = <Row style={{ height: 32 }} />;\nexport function makeRow() { const style = {}; return <Row style={style} />; }`,
      },
      {
        filename,
        code: `${imports}\nfunction createList() { const style = { height: 1 }; return function List() { return <Row style={style} />; }; }`,
      },
      {
        filename,
        code: `${imports}\nexport default async function Page() { const data = await load(); return <Row style={{ height: 32 }} />; }`,
      },
      {
        filename,
        code: `${imports}\nexport function App() { return <Row style={{ height: 32 }} />; }`,
      },
      {
        filename,
        code: `${imports}\nconst Spread = memo(...parts);\nexport function List({ pick }) { return <Spread onPick={() => pick(1)} />; }`,
      },
      {
        filename: path.join(plugin, 'src/ui/list.tsx'),
        code: `import { memo } from 'react';\nconst Local = memo(function Local() { return <li />; });\nexport function List({ pick }) { return <Local onPick={() => pick(1)} />; }`,
      },
      {
        filename: path.join(compiled, 'src/ui/list.tsx'),
        code: `import { memo } from 'react';\nconst Local = memo(function Local() { return <li />; });\nexport function List({ pick }) { return <Local onPick={() => pick(1)} />; }`,
      },
    ]),
  invalid: [
    invalid(
      'return <Row item={items[0]} style={{ height: 32 }} onPick={() => pick(items[0].id)} />;',
      'Row',
      `\`style\` (${OBJECT}), \`onPick\` (${FUNCTION})`,
    ),
    invalid(
      'return <ul>{items.map((item) => <Local key={item.id} tags={[item.tag]} onPick={pick.bind(null, item.id)} />)}</ul>;',
      'Local',
      `\`tags\` (${ARRAY}), \`onPick\` (${FUNCTION})`,
    ),
    invalid(
      'const onPick = (id) => pick(id); function onDrop() { pick(0); } return <LocalForward onPick={onPick} onDrop={onDrop} />;',
      'LocalForward',
      `\`onPick\` (${FUNCTION}), \`onDrop\` (${FUNCTION})`,
    ),
    invalid('return <TableCell icon={<span />} />;', 'TableCell', `\`icon\` (${ELEMENT})`),
    invalid(
      'return <DefaultRow {...style} style={{ height: 32 } as Style} />;',
      'DefaultRow',
      `\`style\` (${OBJECT})`,
    ),
    invalid(
      'return <ListRow onPick={function () { pick(1); }}>plain text</ListRow>;',
      'ListRow',
      `\`onPick\` (${FUNCTION})`,
    ),
    invalid(
      'return <Late style={{ height: 32 }} />;',
      'Late',
      `\`style\` (${OBJECT})`,
      'const Late = memo(function Late() { return <li />; });',
    ),
    invalid(
      'return items.flatMap((item) => [<Row key={item.id} style={{ height: 1 }} />]);',
      'Row',
      `\`style\` (${OBJECT})`,
    ),
    invalid(
      'const [open] = React.useState(false); return <Row style={{ height: open ? 1 : 2 }} />;',
      'Row',
      `\`style\` (${OBJECT})`,
    ),
    invalid(
      'return Array.from(items, (item) => { const tags = [item.tag]; return <Row key={item.id} tags={tags} />; });',
      'Row',
      `\`tags\` (${ARRAY})`,
    ),
  ],
});
