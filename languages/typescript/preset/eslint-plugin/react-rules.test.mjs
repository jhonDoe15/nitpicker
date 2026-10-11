import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as reactNoEffectDataFetching } from './rules/react-no-effect-data-fetching.mjs';
import { rule as reactNoEffectDerivedState } from './rules/react-no-effect-derived-state.mjs';
import { rule as reactSingleStylingApproach } from './rules/react-single-styling-approach.mjs';

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
  ].map((effect) => ({
    filename,
    code: component(effect),
    errors: [{ messageId: 'fetchInEffect' }],
  })),
});

const inlineAllowed = 'inline `style` objects';
const classNamesAllowed = '`className` with CSS Modules or utility classes';
const cssInJsAllowed = 'styled components (styled-components or Emotion)';
const inlineStyleObject = '<div style={{ color: "red" }} />';

function inlineStyleError(allowed) {
  return {
    messageId: 'inlineStyle',
    data: { allowed, example: "style={{ '--progress': percent }}" },
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
