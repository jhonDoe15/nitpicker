import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as reactNoEffectDataFetching } from './rules/react/react-no-effect-data-fetching.mjs';
import { rule as reactNoEffectDerivedState } from './rules/react/react-no-effect-derived-state.mjs';
import { rule as reactSingleStylingApproach } from './rules/react/react-single-styling-approach.mjs';
import { rule as reactTestNoImplementationDetails } from './rules/react/react-test-no-implementation-details.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});
const filename = '/repo/src/main/ui/panel.tsx';

function component(body) {
  return `function Panel({ a, b }) { ${body} return <div />; }`;
}

function withState(effect) {
  return component(`const [x, setX] = useState(0); ${effect}`);
}

tester.run('react-no-effect-derived-state', reactNoEffectDerivedState, {
  valid: [
    withState('const doubled = a * 2;'),
    withState('const reset = () => setX(0);'),
    withState(
      'useEffect(() => { const off = store.subscribe((value) => setX(value)); return off; }, []);',
    ),
    withState(
      'useEffect(() => { async function load() { setX(await read(a)); } void load(); }, [a]);',
    ),
    withState('useEffect(() => { setX(1); }, []);'),
    withState('useEffect(() => { items.forEach((item) => setX(item)); }, [items]);'),
    component('useEffect(() => { setTitle(a); }, [a]);'),
    component('const [x, setX] = Preact.useState(0); useEffect(() => { setX(a); }, [a]);'),
    component('const [x, setX] = React[useState](0); useEffect(() => { setX(a); }, [a]);'),
    withState('Preact.useEffect(() => { setX(a); }, [a]);'),
    withState('React[useEffect](() => { setX(a); }, [a]);'),
    withState('React.useMemo(() => { setX(a); }, [a]);'),
    component('const [x, setX] = useCustom(); useEffect(() => { setX(a); }, [a]);'),
    component('const [x, setX] = useReducer(reduce, 0); useEffect(() => { setX(a); }, [a]);'),
    component('const { 1: setX } = useState(0); useEffect(() => { setX(a); }, [a]);'),
    component('const setX = useState(0); useEffect(() => { setX(a); }, [a]);'),
    withState('useEffect(() => { x(a); }, [a]);'),
    withState('useEffect(() => { props.setX(a); }, [a]);'),
    withState('useEffect(() => { (0, setX)(a); }, [a]);'),
    withState('useMemo(() => { setX(a); }, [a]);'),
    withState('useEffect(update, [a]);'),
    withState('useEffect(() => { document.title = String(a); }, [a]);'),
    withState('for (const [, setY] of pairs) { setY(a); }'),
    component('function Inner({ setX }) { useEffect(() => { setX(a); }, [a]); return null; }'),
    withState('useCustomEffect(() => { setX(a); }, [a]);'),
    withState(
      'useEffect(() => { const sync = () => setX(a); setTimeout(() => sync(), 0); }, [a]);',
    ),
    withState('useEffect(() => { const sync = () => setX(a); items.forEach(sync); }, [a]);'),
    withState('useEffect(() => { const sync = () => setX(a); }, [a]);'),
    withState('useEffect(() => { async function sync() { setX(a); } void sync(); }, [a]);'),
    withState('const sync = () => setX(a); useEffect(() => { sync(); }, [a]);'),
    withState('useEffect(() => { const sync = () => setX(a); sync(); }, []);'),
    "import { useEffect } from './effects'; import { useState } from 'react'; function Panel({ a }) { const [x, setX] = useState(0); useEffect(() => { setX(a); }, [a]); return <div />; }",
    "import { useEffect, useState } from 'react'; function Panel({ a }) { function useState() { return [0, () => undefined]; } const [x, setX] = useState(); useEffect(() => { setX(a); }, [a]); return <div />; }",
    "import * as Preact from 'preact/hooks'; function Panel({ a }) { const [x, setX] = Preact.useState(0); Preact.useEffect(() => { setX(a); }, [a]); return <div />; }",
    "import { createElement as useEffect } from 'react'; function Panel({ a }) { const [x, setX] = useState(0); useEffect(() => { setX(a); }, [a]); return <div />; }",
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      filename,
      code: withState('useEffect(() => { setX(a); setX(b); }, [a, b]);'),
      errors: [{ messageId: 'derivedState' }, { messageId: 'derivedState' }],
    },
    ...[
      withState('useEffect(() => { setX(a + b); }, [a, b]);'),
      withState('useEffect(() => { setX(1); });'),
      withState('useEffect(() => { setX(1); }, deps);'),
      withState('useEffect(() => { if (a) { setX(a); } }, [a]);'),
      withState('useEffect(function () { setX(a); }, [a]);'),
      withState('useLayoutEffect(() => { setX(a); }, [a]);'),
      component('const [x, setX] = React.useState(0); React.useEffect(() => { setX(a); }, [a]);'),
      component('const [, setX] = useState(0); useEffect(() => { setX(a); }, [a]);'),
      component(
        'const [x, setX] = useState(0); const [y, setY] = useState(0); useEffect(() => { setY(x); }, [x]);',
      ),
      withState('useEffect(() => { const sync = () => setX(a * 2); sync(); }, [a]);'),
      withState('useEffect(() => { function sync() { setX(a * 2); } sync(); }, [a]);'),
      withState('useEffect(() => { const sync = function () { setX(a * 2); }; sync(); }, [a]);'),
      component(
        'const state = useState(0); const setX = state[1]; useEffect(() => { setX(a); }, [a]);',
      ),
      "import { useEffect as onEffect, useState as useValue } from 'react'; function Panel({ a }) { const [x, setX] = useValue(0); onEffect(() => { setX(a); }, [a]); return <div />; }",
      "import * as R from 'react'; function Panel({ a }) { const [x, setX] = R.useState(0); R.useEffect(() => { setX(a); }, [a]); return <div />; }",
      "import React from 'react'; function Panel({ a }) { const [x, setX] = React['useState'](0); React['useLayoutEffect'](() => { setX(a); }, [a]); return <div />; }",
    ].map((code) => ({
      filename,
      code,
      errors: [{ messageId: 'derivedState' }],
    })),
  ],
});

tester.run('react-no-effect-data-fetching', reactNoEffectDataFetching, {
  valid: [
    component('const save = () => fetch("/save");'),
    component('useEffect(() => { document.title = "x"; }, []);'),
    component('useEffect(() => { client.fetch(a); }, [a]);'),
    component('useEffect(() => { window.alert(a); }, [a]);'),
    component('useEffect(() => { window.fetchAll(a); }, [a]);'),
    component('useEffect(() => { window[fetch](a); }, [a]);'),
    component('useEffect(() => { api.client.get(a); }, [a]);'),
    component('useEffect(() => { (0, fetch)(a); }, [a]);'),
    component('useEffect(() => { new Map(); }, []);'),
    component('useEffect(() => { new Client.XMLHttpRequest(); }, []);'),
    component('useMemo(() => fetch(a), [a]);'),
    component('useEffect(load, [a]);'),
    component('useData(() => { fetch(a); });'),
    component('useEffect(() => { const run = () => 1; run(); }, []); fetch(a);'),
    "import { useEffect } from './effects'; function Panel({ a }) { useEffect(() => { fetch(a); }, [a]); return <div />; }",
  ].map((code) => ({ filename, code })),
  invalid: [
    'useEffect(() => { fetch(`/items/${a}`); }, [a]);',
    'useEffect(() => { fetch(a).then((response) => response.json()); }, [a]);',
    'useEffect(() => { async function load() { await fetch(a); } void load(); }, [a]);',
    'useEffect(() => { axios.get(a); }, [a]);',
    'useEffect(() => { axios({ url: a }); }, [a]);',
    'useEffect(() => { ky.post(a); }, [a]);',
    'useEffect(() => { window.fetch(a); }, [a]);',
    'useEffect(() => { globalThis.fetch(a); }, [a]);',
    'useEffect(() => { self.fetch(a); }, [a]);',
    'useEffect(() => { new XMLHttpRequest(); }, [a]);',
    'useLayoutEffect(() => { fetch(a); }, [a]);',
    'React.useEffect(function () { fetch(a); }, [a]);',
  ]
    .map((effect) => component(effect))
    .concat([
      "import { useEffect as onEffect } from 'react'; function Panel({ a }) { onEffect(() => { fetch(a); }, [a]); return <div />; }",
      "import * as R from 'react'; function Panel({ a }) { R.useEffect(() => { fetch(a); }, [a]); return <div />; }",
    ])
    .map((code) => ({ filename, code, errors: [{ messageId: 'fetchInEffect' }] })),
});

const inlineAllowed = 'inline `style` objects';
const classNamesAllowed = '`className` with CSS Modules or utility classes';
const cssInJsAllowed = 'styled components (styled-components or Emotion)';
const inlineStyleObject = '<div style={{ color: "red" }} />';

function inlineStyleError(allowed) {
  return {
    messageId: 'inlineStyle',
    data: {
      allowed,
      example: "style={{ '--progress': percent }}",
      typing: "declare module 'csstype' { interface Properties { '--progress'?: number } }",
    },
  };
}

function otherApproachError(allowed, found) {
  return { messageId: 'otherApproach', data: { allowed, found } };
}

function jsx(markup) {
  return `export function Panel() { return ${markup}; }`;
}

tester.run('react-single-styling-approach: class names by default', reactSingleStylingApproach, {
  valid: [
    jsx('<div className="panel" />'),
    jsx('<div style={{ "--progress": percent }} />'),
    jsx('<div style={{ "--a": 1, "--b": 2 }} />'),
    jsx('<div style={{}} />'),
    jsx('<div style={style} />'),
    'export function Panel({ style }) { return <div style={style} />; }',
    "const vars = { '--progress': 1 }; export function Panel() { return <div style={vars} />; }",
    "export function Panel({ on }) { return <div style={on ? { '--a': 1 } : { '--b': 2 }} />; }",
    jsx('<div style="color: red" />'),
    jsx('<div style />'),
    jsx('<Chart title={{ color: "red" }} />'),
    jsx('<svg xlink:href="#a" />'),
    "import styles from './panel.module.css';",
    "import './panel.scss';",
    "import { useState } from 'react';",
    "import styled from 'styled-components-extra';",
    "import { css } from 'goober-utils';",
    "import { sprinkles } from './panel.css.ts';",
    "import { x } from '@emotion';",
  ].map((code) => ({ filename, code })),
  invalid: [
    { code: jsx(inlineStyleObject), errors: [inlineStyleError(classNamesAllowed)] },
    {
      code: jsx('<div style={{ "--progress": percent, color: "red" }} />'),
      errors: [inlineStyleError(classNamesAllowed)],
    },
    { code: jsx('<div style={{ ...base }} />'), errors: [inlineStyleError(classNamesAllowed)] },
    ...[
      'const shared = { color: "red" }; export function Panel() { return <div style={shared} />; }',
      'const shared: CSSProperties = { color: "red" }; export function Panel() { return <div style={shared} />; }',
      'const first = { color: "red" }; const second = first; export function Panel() { return <div style={second} />; }',
      'export function Panel({ on }) { return <div style={on ? { width: 1 } : { width: 2 }} />; }',
      'export function Panel({ on }) { return <div style={on ? { width: 1 } : undefined} />; }',
      'export function Panel({ on }) { return <div style={on && { width: 1 }} />; }',
      'export function Panel({ on }) { return <div style={base ?? { width: 1 }} />; }',
      'export function Panel() { return <div style={{ width: 1 } satisfies CSSProperties} />; }',
      'export function Panel() { return <div style={{ width: 1 } as const} />; }',
      'const shared = { width: 1 }; export function Panel({ on }) { return <div style={on ? shared : undefined} />; }',
      'const shared = { "--a": 1, width: 1 }; export function Panel() { return <div style={shared} />; }',
    ].map((code) => ({ code, errors: [inlineStyleError(classNamesAllowed)] })),
    { code: jsx('<div style={{ [name]: 1 }} />'), errors: [inlineStyleError(classNamesAllowed)] },
    { code: jsx('<div style={{ 1: "a" }} />'), errors: [inlineStyleError(classNamesAllowed)] },
    {
      code: jsx('<div style={{ "--a": 1, ...base }} />'),
      errors: [inlineStyleError(classNamesAllowed)],
    },
    ...[
      'styled-components',
      '@emotion/styled',
      '@emotion/react',
      '@stitches/react',
      'goober',
      '@linaria/core',
    ].map((source) => ({
      code: `import { css } from '${source}';`,
      errors: [otherApproachError(classNamesAllowed, 'a CSS-in-JS library')],
    })),
  ].map((testCase) => ({ filename, ...testCase })),
});

tester.run('react-single-styling-approach: css-in-js', reactSingleStylingApproach, {
  valid: [
    "import styled from 'styled-components';",
    "import { css } from '@emotion/react';",
    jsx('<div style={{ "--progress": percent }} />'),
    jsx('<div className="panel" />'),
    "import { x } from './panel.css.ts';",
  ].map((code) => ({ filename, code, options: [{ approach: 'css-in-js' }] })),
  invalid: [
    {
      code: jsx(inlineStyleObject),
      errors: [inlineStyleError(cssInJsAllowed)],
    },
    {
      code: "import './panel.css';",
      errors: [otherApproachError(cssInJsAllowed, 'a stylesheet import')],
    },
    ...['scss', 'sass', 'less', 'styl', 'pcss', 'css'].map((extension) => ({
      code: `import styles from './panel.module.${extension}';`,
      errors: [otherApproachError(cssInJsAllowed, 'a stylesheet import')],
    })),
  ].map((testCase) => ({ filename, options: [{ approach: 'css-in-js' }], ...testCase })),
});

tester.run('react-single-styling-approach: inline style', reactSingleStylingApproach, {
  valid: [
    jsx(inlineStyleObject),
    jsx('<div className="panel" style={{ color: "red" }} />'),
    "import { useState } from 'react';",
  ].map((code) => ({ filename, code, options: [{ approach: 'inline-style' }] })),
  invalid: [
    {
      code: "import './panel.css';",
      errors: [otherApproachError(inlineAllowed, 'a stylesheet import')],
    },
    {
      code: "import styled from 'styled-components';",
      errors: [otherApproachError(inlineAllowed, 'a CSS-in-JS library')],
    },
  ].map((testCase) => ({ filename, options: [{ approach: 'inline-style' }], ...testCase })),
});

const testFilename = '/repo/test/ui/panel.test.tsx';
const plainTestFilename = '/repo/test/domain/store.test.ts';
const reactTestingImport = "import { render } from '@testing-library/react'; ";
const enzymeWrapper = "import { mount } from 'enzyme'; const wrapper = mount(Panel); ";

function componentInternalsError(name) {
  return { messageId: 'componentInternals', data: { name } };
}

function fiberInternalsError(name) {
  return { messageId: 'fiberInternals', data: { name } };
}

tester.run('react-test-no-implementation-details', reactTestNoImplementationDetails, {
  valid: [
    "await userEvent.click(screen.getByRole('button', { name: 'Save' }));",
    "expect(screen.getByRole('status')).toHaveTextContent('Saved');",
    'const { result } = renderHook(() => useCounter()); expect(result.current.count).toBe(0);',
    'const { rerender } = render(<Panel />); rerender(<Panel a={1} />);',
    'expect(store.state).toEqual({});',
    'const count = form.state;',
    'const value = state();',
    'instance();',
    'vi.spyOn(console, "error");',
    'vi.spyOn(React, "createElement");',
    'vi.spyOn(Preact, "useState");',
    'vi.spyOn(React);',
    'vi.spyOn();',
    'vi.spyOn(React, name);',
    'vi.spyOn(React, `useState`);',
    'vi.spyOn(React.hooks, "useState");',
    'spyOn(React, "useState");',
    'vi.fn(React, "useState");',
    'node.ref;',
    'node[name];',
    'node["ref"];',
    'node[0];',
    'reactNode.value;',
    'react.useState;',
    "vi.mock('react-dom', () => ({ createPortal: (node) => node }));",
    "vi.mock('./use-cart', () => ({ useCart: vi.fn() }));",
    'vi.mock(name, () => ({ useState: vi.fn() }));',
    "mock('react', () => ({ useState: vi.fn() }));",
    "vi.fn('react', () => ({ useState: vi.fn() }));",
    'useStore.setState({ count: 0 });',
    'expect(machine.state()).toEqual({});',
    "import { mount } from 'other-mount'; mount(Panel).setState({});",
  ]
    .map((code) => ({ filename: testFilename, code: `${reactTestingImport}${code}` }))
    .concat(
      [
        'useStore.setState({ count: 0 });',
        'Registry.getInstance();',
        'expect(machine.state()).toEqual({});',
        'const fiber = node.stateNode;',
        'vi.spyOn(React, "useState");',
        "import { test } from '@playwright/test'; test('a', async ({ page }) => { page.instance(); });",
        "import { createStore } from 'redux-like'; createStore().setState({});",
        "import { reactive } from 'vue'; reactive().state();",
        "import * as Hooks from 'preact/hooks'; vi.spyOn(Hooks, 'useState');",
        "const Hooks = require('preact/hooks'); vi.spyOn(Hooks, 'useState');",
        "import * as ReactNamespace from 'react'; vi.spyOn(ReactNamespace, 'createElement');",
        "import { useState } from 'react'; vi.spyOn(Hooks, 'useState');",
        "let Hooks; vi.spyOn(Hooks, 'useState');",
        "const Hooks = await import('preact/hooks'); vi.spyOn(Hooks, 'useState');",
        "const Hooks = await vi.importActual('preact/hooks'); vi.spyOn(Hooks, 'useState');",
        "import * as Hooks from 'preact/hooks'; const R = Hooks; vi.spyOn(R, 'useState');",
        "const R = await import('react'); vi.spyOn(R, 'createElement');",
        "import { default as Preact } from 'preact'; vi.spyOn(Preact, 'useState');",
        "vi.spyOn(require('preact'), 'useState');",
      ].map((code) => ({ filename: plainTestFilename, code })),
    ),
  invalid: [
    { code: 'wrapper.instance();', errors: [componentInternalsError('instance()')] },
    { code: 'renderer.getInstance();', errors: [componentInternalsError('getInstance()')] },
    ...[
      `${enzymeWrapper}expect(wrapper.state()).toEqual({});`,
      `${enzymeWrapper}wrapper["state"]();`,
      "import * as enzyme from 'enzyme'; let view; view = enzyme.shallow(Panel); view.state();",
    ].map((code) => ({ code, errors: [componentInternalsError('state()')] })),
    ...[
      `${enzymeWrapper}wrapper.setState({ open: true });`,
      "import { shallow as s } from 'enzyme'; s(Panel).setState({});",
    ].map((code) => ({ code, errors: [componentInternalsError('setState()')] })),
    ...['findByType', 'findAllByType', 'findByProps', 'findAllByProps'].map((method) => ({
      code: `renderer.root.${method}(Panel);`,
      errors: [componentInternalsError(`${method}()`)],
    })),
    ...[
      '_reactInternals',
      '_reactInternalFiber',
      'stateNode',
      'memoizedState',
      'memoizedProps',
    ].map((property) => ({
      code: `const fiber = node.${property};`,
      errors: [fiberInternalsError(property)],
    })),
    {
      code: 'const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$")); node[node.__reactFiber$abc];',
      errors: [fiberInternalsError('__reactFiber$abc')],
    },
    { code: 'node["stateNode"];', errors: [fiberInternalsError('stateNode')] },
    ...['useState', 'useEffect', 'useContext'].map((hook) => ({
      code: `vi.spyOn(React, "${hook}");`,
      errors: [{ messageId: 'hookSpy', data: { name: hook } }],
    })),
    {
      code: 'jest.spyOn(react, "useState").mockReturnValue([1, setX]);',
      errors: [{ messageId: 'hookSpy', data: { name: 'useState' } }],
    },
    {
      code: "vi.spyOn(require('react'), 'useState');",
      errors: [{ messageId: 'hookSpy', data: { name: 'useState' } }],
    },
    ...[
      "const R = await import('react'); vi.spyOn(R, 'useState');",
      "vi.spyOn(await vi.importActual('react'), 'useEffect');",
      "vi.spyOn(await vi.importActual<typeof import('react')>('react'), 'useEffect');",
      "const R = await jest.requireActual('react'); jest.spyOn(R, 'useEffect');",
      "const R = React; vi.spyOn(R, 'useState');",
      "const R = React; const Q = R; vi.spyOn(Q, 'useState');",
      "vi.spyOn(React.default, 'useState');",
      "vi.spyOn(React, name as 'useState');",
      "vi.spyOn(React, 'useState' as const);",
      "it('a', () => { const R = require('react'); vi.spyOn(R, 'useState'); });",
      "function load() { return vi.spyOn(require('react'), 'useRef'); }",
    ].map((code) => ({
      code,
      errors: [{ messageId: 'hookSpy' }],
    })),
    ...[
      [
        "vi.mock('react', async (importOriginal) => ({ ...(await importOriginal()), useState: vi.fn(() => ['x', vi.fn()]) }));",
        'useState',
      ],
      [
        "jest.mock('react', () => ({ ...jest.requireActual('react'), useEffect: (f) => f() }));",
        'useEffect',
      ],
      [
        "vi.doMock('react', () => ({ useId: () => 'id', 'useMemo': (f) => f() }));",
        'useId`, `useMemo',
      ],
      ["vi.mock(import('react'), () => ({ useState: vi.fn() }));", 'useState'],
      [
        "vi.mock('react-dom', () => ({ useFormStatus: () => ({ pending: true }) }));",
        'useFormStatus',
      ],
      ["vi.mock('react');", 'react'],
      ["vi.mock('react', () => ({ createElement: vi.fn() }));", 'react'],
    ].map(([code, name]) => ({ code, errors: [{ messageId: 'reactMock', data: { name } }] })),
    {
      code: `${enzymeWrapper}vi.spyOn(React, "useState"); wrapper.state();`,
      errors: [{ messageId: 'hookSpy' }, componentInternalsError('state()')],
    },
  ]
    .map((testCase) => ({
      filename: testFilename,
      ...testCase,
      code: `${reactTestingImport}${testCase.code}`,
    }))
    .concat(
      [
        "import { mount } from 'enzyme';",
        "import renderer from 'react-test-renderer';",
        "import { createRoot } from 'react-dom/client';",
        "import React from 'react';",
        "import type { Wrapper } from '@testing-library/react';",
        "const { render } = require('@testing-library/react');",
        "import enzyme = require('enzyme');",
        "export { render } from '@testing-library/react';",
      ].map((importLine) => ({
        filename: plainTestFilename,
        code: `${importLine} wrapper.instance();`,
        errors: [componentInternalsError('instance()')],
      })),
    )
    .concat(
      [
        "vi.mock('react', () => ({ useState: vi.fn() }));",
        "jest.mock('react-dom', () => ({ useFormStatus: jest.fn() }));",
      ].map((code) => ({
        filename: plainTestFilename,
        code,
        errors: [{ messageId: 'reactMock' }],
      })),
    )
    .concat(
      [
        ["import * as R from 'react';", 'R', 'useState'],
        ["import MyReact from 'react';", 'MyReact', 'useReducer'],
        ["import * as R from 'react';", 'R', 'useLayoutEffect'],
        ["import R = require('react');", 'R', 'useEffect'],
        ["const R = require('react');", 'R', 'useContext'],
        ["import React, * as Namespace from 'react';", 'Namespace', 'useMemo'],
        ["import { default as R } from 'react';", 'R', 'useRef'],
      ].map(([importLine, target, hook]) => ({
        filename: testFilename,
        code: `${importLine} jest.spyOn(${target}, '${hook}');`,
        errors: [{ messageId: 'hookSpy', data: { name: hook } }],
      })),
    ),
});
