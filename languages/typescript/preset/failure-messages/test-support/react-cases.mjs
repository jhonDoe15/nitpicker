import tseslint from 'typescript-eslint';
import { reactSyntaxConfigFor } from '../../eslint-config/react/react-scope.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';
import { browserCases } from './react/browser-cases.mjs';
import { correctnessCases } from './react/correctness-cases.mjs';
import { exceptionHintCases } from './react/exception-hint-cases.mjs';

const filename = 'src/main/ui/fixture.tsx';
const parserConfig = { languageOptions: { parser: tseslint.parser } };
const reactConfigs = {
  'class-names': [parserConfig, ...(await reactSyntaxConfigFor(defaultResolvedLayout))],
  'css-in-js': [
    parserConfig,
    ...(await reactSyntaxConfigFor(defaultResolvedLayout, { styling: 'css-in-js' })),
  ],
  'inline-style': [
    parserConfig,
    ...(await reactSyntaxConfigFor(defaultResolvedLayout, { styling: 'inline-style' })),
  ],
};

function reactCase([name, banned, allowed, styling = 'class-names']) {
  return { name: `react: ${name}`, config: reactConfigs[styling], filename, banned, allowed };
}

const testFilename = 'test/ui/panel.test.tsx';
const testingLibraryImport = [
  "import { render, screen, fireEvent, waitFor } from '@testing-library/react';",
  "import userEvent from '@testing-library/user-event';",
  '',
].join('\n');

function reactTestCase([name, banned, allowed]) {
  return {
    name: `react test: ${name}`,
    config: reactConfigs['class-names'],
    filename: testFilename,
    banned: `${testingLibraryImport}${banned}`,
    allowed,
  };
}

function panel(body) {
  return `export function Panel({ a }) { ${body} return <div />; }`;
}

const exclusivePair =
  'export function Panel({ a, b }) { if (a && b) { throw new Error("both"); } return <div />; }';

const reactSyntaxCases = [
  [
    'class component names function components',
    "import React from 'react'; export class Panel extends React.Component { render() { return <div />; } }",
    'function components',
  ],
  ['conditional hook names the same call order', panel('if (a) { useState(1); }'), 'same order'],
  [
    'hard-coded color names the theme',
    "export const Dot = () => <svg fill='#336699' />;",
    'theme or design-system palette',
  ],
  [
    'hard-coded color names the config exception',
    "export const Dot = () => <svg fill='#336699' />;",
    'nitpicker/react-no-hardcoded-colors in nitpicker.config.json',
  ],
  [
    'conditional hook names the config exception',
    panel('if (a) { useState(1); }'),
    'nitpicker.config.json',
  ],
  [
    'class component names the config exception',
    "import React from 'react'; export class Panel extends React.Component { render() { return <div />; } }",
    'nitpicker.config.json',
  ],
  [
    'missing effect dependency names the config exception',
    panel('useEffect(() => { log(a); }, []);'),
    'nitpicker.config.json',
  ],
  [
    'singular and plural props name the one-element array',
    'export type PanelProps = { tag?: string; tags?: string[] };',
    'one-element array',
  ],
  [
    'singular and plural props name the config exception',
    'export type PanelProps = { tag?: string; tags?: string[] };',
    'nitpicker.config.json',
  ],
  ['exclusive props check names the discriminated union', exclusivePair, 'discriminated union'],
  ['exclusive props check names the config exception', exclusivePair, 'nitpicker.config.json'],
  [
    'index key names a stable id',
    'export const List = ({ items }) => <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;',
    'stable id',
  ],
  [
    'index key names the config exception',
    'export const List = ({ items }) => <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;',
    'nitpicker.config.json',
  ],
  [
    'derived state names computing during render',
    panel('const [x, setX] = useState(0); useEffect(() => { setX(a * 2); }, [a]);'),
    'during render',
  ],
  [
    'derived state names the config exception',
    panel('const [x, setX] = useState(0); useEffect(() => { setX(a * 2); }, [a]);'),
    'nitpicker.config.json',
  ],
  [
    'data fetching in an effect names a query library',
    panel('useEffect(() => { fetch(`/items/${a}`); }, [a]);'),
    'useQuery',
  ],
  [
    'data fetching in an effect names the config exception',
    panel('useEffect(() => { fetch(`/items/${a}`); }, [a]);'),
    'nitpicker.config.json',
  ],
  [
    'inline style names className',
    "export const Box = () => <div style={{ color: 'red' }} />;",
    '`className`',
  ],
  [
    'inline style names a CSS custom property',
    "export const Box = () => <div style={{ color: 'red' }} />;",
    'CSS custom property',
  ],
  [
    'inline style names the typed custom property',
    "export const Box = () => <div style={{ color: 'red' }} />;",
    "declare module 'csstype'",
  ],
  [
    'inline style names the config exception',
    "export const Box = () => <div style={{ color: 'red' }} />;",
    'nitpicker.config.json',
  ],
  [
    'another styling approach names the styling setting',
    "import styled from 'styled-components';",
    '"styling" under "react"',
  ],
  [
    'CSS-in-JS import names className',
    "import styled from 'styled-components';",
    'CSS Modules or utility classes',
  ],
  [
    'inline style names styled components when the project uses CSS-in-JS',
    "export const Box = () => <div style={{ color: 'red' }} />;",
    'styled components',
    'css-in-js',
  ],
  [
    'stylesheet import names styled components when the project uses CSS-in-JS',
    "import './box.css';",
    'styled components',
    'css-in-js',
  ],
  [
    'stylesheet import names inline style objects when the project uses them',
    "import './box.css';",
    'inline `style` objects',
    'inline-style',
  ],
  [
    'image without alt names the alt prop',
    "export const Logo = () => <img src='logo.png' />;",
    'alt prop',
  ],
  [
    'click handler on a div names the keyboard listener',
    'export const Box = ({ open }) => <div onClick={open} />;',
    'keyboard listener',
  ],
  [
    'accessibility findings name the config exception',
    "export const Logo = () => <img src='logo.png' />;",
    'nitpicker.config.json',
  ],
].map(reactCase);

const reactTestCases = [
  ['test id query names the accessible role', "screen.getByTestId('save');", 'screen.getByRole'],
  [
    'test id query names the config exception',
    "screen.getByTestId('save');",
    'nitpicker.config.json',
  ],
  [
    'container query names the accessible role',
    "const { container } = render(<Panel />); container.querySelector('.save');",
    'screen.getByRole',
  ],
  [
    'container query names the config exception',
    "const { container } = render(<Panel />); container.querySelector('.save');",
    'nitpicker.config.json',
  ],
  ['fireEvent names userEvent', "fireEvent.click(screen.getByRole('button'));", 'await user.click'],
  [
    'fireEvent names the config exception',
    "fireEvent.click(screen.getByRole('button'));",
    'nitpicker.config.json',
  ],
  [
    'unawaited userEvent names await',
    "userEvent.click(screen.getByRole('button'));",
    'await user.<event>',
  ],
  [
    'unawaited userEvent names the user-event v13 exception',
    "userEvent.click(screen.getByRole('button'));",
    'user-event v13',
  ],
  [
    'unawaited findBy query names await',
    "const button = screen.findByRole('button');",
    'await screen.findByRole',
  ],
  ['unawaited waitFor names await', 'waitFor(() => expect(ok()).toBe(true));', 'await waitFor'],
  [
    'node access names toHaveFocus',
    'expect(document.activeElement).toBe(button);',
    '`toHaveFocus()`',
  ],
  [
    'component state names what the user sees',
    'expect(wrapper.state()).toEqual({});',
    'what the user sees',
  ],
  [
    'component state names the config exception',
    'expect(wrapper.state()).toEqual({});',
    'nitpicker.config.json',
  ],
  [
    'hover test names tabbing to the element',
    "await userEvent.hover(screen.getByRole('button'));",
    'await user.tab()',
  ],
  [
    'hover test names the config exception',
    "await userEvent.hover(screen.getByRole('button'));",
    'nitpicker.config.json',
  ],
  ['hook spy names renderHook', "vi.spyOn(React, 'useState');", '`renderHook`'],
].map(reactTestCase);

export const reactFailureMessageCases = [
  ...reactSyntaxCases,
  ...reactTestCases,
  ...correctnessCases.map(reactCase),
  ...browserCases.map(reactCase),
  ...exceptionHintCases,
];
