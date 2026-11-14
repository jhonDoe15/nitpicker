import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './react-test-no-implementation-details.mjs';

const tester = typescriptRuleTester();
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

tester.run('react-test-no-implementation-details', rule, {
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
    "import sinon from 'sinon'; sinon.stub(api, 'useLoad');",
    "import sinon from 'sinon'; sinon.stub(React);",
    "import { mock } from 'node:test'; mock.method(React, 'createElement');",
    "import { mock } from './doubles.js'; mock.method(React, 'useState');",
    "import proxyquire from 'proxyquire'; proxyquire('react', { './panel': {} });",
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
    )
    .concat(
      [
        ["import { mock } from 'node:test'; mock.method(React, 'useState');", 'useState'],
        ["it('a', (t) => { t.mock.method(React, 'useEffect'); });", 'useEffect'],
        ["import sinon from 'sinon'; sinon.stub(React, 'useState');", 'useState'],
        ["import * as sinon from 'sinon'; sinon.spy(React, 'useRef');", 'useRef'],
        [
          "const box = sinon.createSandbox(); box.replace(React, 'useMemo', (f) => f());",
          'useMemo',
        ],
        ["import td from 'testdouble'; td.replace(React, 'useContext');", 'useContext'],
      ].map(([code, hook]) => ({
        filename: testFilename,
        code: `${reactTestingImport}${code}`,
        errors: [{ messageId: 'hookSpy', data: { name: hook } }],
      })),
    )
    .concat(
      [
        [
          "import { mock } from 'node:test'; mock.module('react', { namedExports: { useState: () => [1] } });",
          'useState',
        ],
        [
          "const proxyquire = require('proxyquire').noCallThru(); const { Panel } = proxyquire('../panel', { react: { useId: () => 'id' } });",
          'useId',
        ],
        [
          "import esmock from 'esmock'; const { Panel } = await esmock('../panel.js', { 'react-dom': { useFormStatus: () => ({}) } });",
          'useFormStatus',
        ],
      ].map(([code, name]) => ({
        filename: plainTestFilename,
        code,
        errors: [{ messageId: 'reactMock', data: { name } }],
      })),
    ),
});
