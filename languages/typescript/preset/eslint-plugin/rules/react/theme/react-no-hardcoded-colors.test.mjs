import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as reactNoHardcodedColors } from './react-no-hardcoded-colors.mjs';

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
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});
const component = '/repo/src/main/ui/panel.tsx';

function reported(color) {
  return [{ messageId: 'hardcodedColor', data: { color } }];
}

function invalid(cases, filename = component) {
  return cases.map(([code, color]) => ({
    filename,
    code,
    errors: [color].flat().flatMap(reported),
  }));
}

const valid = [
  "const style = { color: 'var(--text-primary)' };",
  "const style = { color: 'currentColor', background: 'transparent' };",
  "const style = { fill: 'inherit', stroke: 'initial', backgroundColor: 'unset' };",
  "const style = { color: theme.colors.text, backgroundColor: palette['surface'] };",
  "const icon = <svg fill='none' stroke='currentColor' />;",
  "const icon = <Icon fill={fill} stroke='var(--stroke)' color={theme.accent} />;",
  "const product = { name: 'Tee', color: 'black' };",
  "const statuses = { ok: { color: 'green' }, failed: { color: 'red', fill: 'red' } };",
  "const label = 'red';",
  "const style = { display: 'red' };",
  "const style = { content: 'white', label: 'black' };",
  "const note = { border: '1px solid #ccc', boxShadow: '0 0 4px rgba(0, 0, 0, 0.2)' };",
  "const hash = '#add'; const year = '#2024'; const id = '#bed';",
  "navigate('#add');",
  "const link = <a href='#fff'>Top</a>;",
  "const link = <a href='#abcdef'>Top</a>;",
  "const link = <a href='#section'>Top</a>;",
  "const link = <a href='#123abc-like'>Top</a>;",
  "const link = <a href='/docs#abcdef'>Top</a>;",
  "const link = <a href='https://example.com/page#abc123'>Top</a>;",
  "const link = <Link to='#abc' />;",
  "const field = <label htmlFor='#abc' id='#def' />;",
  "const field = <input data-id='#add' data-ref='#2024' />;",
  "const field = <input value='#add' label='#bed' placeholder='#2024' />;",
  "const field = <input aria-label='#add' name='#bed' />;",
  "const mod = import('#abc');",
  "const kind: '#fff' = value;",
  "const style = { '#fff': 1, '#add': 2 };",
  "const text = 'Issue #123 is fixed';",
  "const text = 'fixes: #123';",
  "const text = 'order: #1234';",
  "const text = 'Error: bad value #abcdef';",
  "const text = 'see color #ff';",
  "const text = '#12345';",
  "const text = '#1234567';",
  "const text = '#ggg';",
  "const text = 'font-size: 12px; margin: 0';",
  "const text = 'Use rgb(255, 0, 0) format';",
  "const text = 'Pass hsl(210 50% 40%) or a name';",
  "const text = 'Choose a color(s) below';",
  "const text = 'rgb';",
  "const style = { color: 'rgb(var(--brand-rgb) / 50%)' };",
  "const style = { color: 'hsl(var(--hue) 50% 50%)' };",
  "const style = { color: 'color-mix(in srgb, var(--a), var(--b))' };",
  'const style = { color: `var(--${name})` };',
  'const text = `color: ${token}`;',
  'const text = `${base} and #zzz`;',
  "const mask = <rect fill='url(#abc123)' />;",
  "const style = <div style={{ background: 'url(#fade)' }} />;",
  "const classes = 'bg-primary text-white hover:bg-gray-100';",
  "const classes = 'bg-[var(--brand)] w-[#abc-id]';",
  'const Title = styled.h1`color: ${theme.text}; background: var(--surface); margin: 0;`;',
  'const Title = styled.h1`color: rgb(var(--brand-rgb));`;',
  'const Title = styled.h1`/* was #fff, now themed */ margin: 0;`;',
  'const Title = styled.h1`mask: url(#abc123);`;',
  'const Title = styled.h1`#add:hover & { margin: 0 }`;',
  'const rule = css`a:hover #add { margin: 0 }`;',
  'const Title = styled.h1`color: inherit; background: transparent; fill: currentColor;`;',
  'const Title = styled.h1`--accent-name: red; margin: 0;`;',
  "throw new Error('invalid color: expected #rrggbb or #fff');",
  "throw new Error('Invalid color: #fff is not allowed');",
  "throw new Error('Unknown background: #abc');",
  'const note = String.raw`margin: 0`;',
  'const note = format(`color: ${x}`);',
  "const style = { color: 'red' };",
  "const style: Layout = { color: 'red' };",
  "const style = { color: 'red' } as Layout;",
].map((code) => ({ filename: component, code }));

const hexAndFunctions = [
  ["const style = { color: '#fff' };", '#fff'],
  ["const style = { color: '#FFF' };", '#FFF'],
  ["const style = { color: '#ffff' };", '#ffff'],
  ["const style = { color: '#add' };", '#add'],
  ["const style = { background: '#2024' };", '#2024'],
  ["const style = { 'background-color': '#336699' };", '#336699'],
  ["const style = { color: '#336699' };", '#336699'],
  ["const style = { color: '#336699cc' };", '#336699cc'],
  ["const color = '#336699';", '#336699'],
  ["const brand = { accent: '#336699cc' };", '#336699cc'],
  ["const icon = <svg fill='#333' />;", '#333'],
  ["const icon = <svg stroke={'#333'} />;", '#333'],
  ["const icon = <Icon color='#2024' />;", '#2024'],
  ["const field = <input type='color' value='#336699' />;", '#336699'],
  ["const color = 'rgb(255, 0, 0)';", 'rgb(255, 0, 0)'],
  ["const style = { color: 'rgba(0,0,0,.5)' };", 'rgba(0,0,0,.5)'],
  ["const color = 'hsl(210 50% 40%)';", 'hsl(210 50% 40%)'],
  ["const color = 'hsla(210, 50%, 40%, 0.5)';", 'hsla(210, 50%, 40%, 0.5)'],
  ["const color = 'hwb(210 10% 20%)';", 'hwb(210 10% 20%)'],
  ["const color = 'lab(50% 40 59.5)';", 'lab(50% 40 59.5)'],
  ["const color = 'lch(50% 80 30)';", 'lch(50% 80 30)'],
  ["const color = 'oklab(0.6 0.1 0.1)';", 'oklab(0.6 0.1 0.1)'],
  ["const color = 'oklch(60% 0.2 30)';", 'oklch(60% 0.2 30)'],
  ["const color = 'color(display-p3 1 0 0)';", 'color(display-p3 1 0 0)'],
];

const styleContexts = [
  ["const x = <div style={{ border: '1px solid #ccc' }} />;", '#ccc'],
  ["const x = <div style={{ boxShadow: '0 0 4px rgba(0, 0, 0, 0.2)' }} />;", 'rgba(0, 0, 0, 0.2)'],
  ["const x = <div style={{ outline: '#add' }} />;", '#add'],
  ["const x = <div sx={{ bgcolor: '#add' }} />;", '#add'],
  ["const x = <div css={{ color: 'red' }} />;", 'red'],
  ["const x = <div style={{ color: 'red' }} />;", 'red'],
  ["const x = <div style={{ color: 'White' }} />;", 'white'],
  ["const x = <div style={{ backgroundColor: ' gray ' }} />;", 'gray'],
  ["const x = <div style={{ background: 'grey' }} />;", 'grey'],
  ["const x = <div style={{ borderColor: 'black' }} />;", 'black'],
  ["const x = <div style={{ outlineColor: 'rebeccapurple' }} />;", 'rebeccapurple'],
  ["const x = <div style={{ textDecorationColor: 'blue' }} />;", 'blue'],
  ["const x = <div style={{ caretColor: 'green' }} />;", 'green'],
  ["const x = <div style={{ 'background-color': 'red' }} />;", 'red'],
  ['const x = <div style={{ color: `red` }} />;', 'red'],
  ["const x = <div style={{ color: active ? 'red' : 'blue' }} />;", ['red', 'blue']],
  ["const x = <div style={{ color: (active && 'red') as string }} />;", 'red'],
  ["const x = <div style={{ '&:hover': { color: 'red' } }} />;", 'red'],
  ["const x = <div style={active ? { color: 'red' } : undefined} />;", 'red'],
  ["const sheet = StyleSheet.create({ box: { color: 'red', borderWidth: 1 } });", 'red'],
  ["const Box = styled.div({ color: 'red', margin: 0 });", 'red'],
  ["const Box = styled('div')({ border: '1px solid #ccc' });", '#ccc'],
  ["const rule = css({ color: 'red' });", 'red'],
  ["const style: CSSProperties = { color: 'red' };", 'red'],
  ["const style: React.CSSProperties = { border: '1px solid #ccc' };", '#ccc'],
  ["const style = { color: 'red' } satisfies CSSProperties;", 'red'],
  ["const style = { color: 'red' } as React.CSSProperties;", 'red'],
];

const attributesAndDeclarations = [
  ["const icon = <svg fill='red' />;", 'red'],
  ["const icon = <Text color='gray' />;", 'gray'],
  ["const icon = <Text color={active ? 'red' : 'blue'} />;", ['red', 'blue']],
  ["const text = 'color: #fff';", '#fff'],
  ["const text = 'border: 1px solid #ccc; margin: 0';", '#ccc'],
  ["const text = 'box-shadow: 0 0 4px rgba(0, 0, 0, 0.2)';", 'rgba(0, 0, 0, 0.2)'],
  ["const text = '--brand: #336699';", '#336699'],
  ["const text = 'background-image: linear-gradient(#fff, #000)';", '#fff'],
  ['const text = `color: #fff`;', '#fff'],
  ['const text = `color: #fff; padding: ${size}px`;', '#fff'],
  ['const text = `border: 1px solid rgb(0 0 0 / 10%)`;', 'rgb(0 0 0 / 10%)'],
  ["const classes = 'bg-[#336699] p-2';", '#336699'],
  ["const classes = 'hover:text-[#fff]';", '#fff'],
  ["const classes = 'bg-[#add]';", '#add'],
  ["const classes = 'bg-[rgb(0,0,0)]';", 'rgb(0,0,0)'],
  ["const classes = 'border-[rgba(0,0,0,.5)] p-2';", 'rgba(0,0,0,.5)'],
  ["const classes = <div className='bg-[#336699]' />;", '#336699'],
];

const templates = [
  ['const note = other`color: #fff;`;', '#fff'],
  ['const Title = styled.h1`color: #fff;`;', '#fff'],
  ['const Title = styled.h1`color: #add;`;', '#add'],
  ['const Title = styled(Base)`border: 1px solid #ccc;`;', '#ccc'],
  ["const Title = styled.h1.attrs({ role: 'heading' })`background:#12345678;`;", '#12345678'],
  ["const Title = styled('h1')`color: rgb(1, 2, 3);`;", 'rgb(1, 2, 3)'],
  [
    'const Title = styled.h1`margin: 0 ${gap}px; color: ${theme.text}; border-color: #abc;`;',
    '#abc',
  ],
  ['const rule = css`color: #fff;`;', '#fff'],
  ['const spin = keyframes`from { color: #fff } to { color: ${end} }`;', '#fff'],
  ['const Global = createGlobalStyle`body { background: #101010; }`;', '#101010'],
  ['const rule = css`outline: 1px solid ${edge} #fff;`;', '#fff'],
  ['const Title = styled.h1`/* old */ color: #fff;`;', '#fff'],
  ['const Title = styled.h1`mask: url(#abc123); color: #fff;`;', '#fff'],
  ['const Title = styled.h1`color: red;`;', 'red'],
  ['const Title = styled.h1`margin: 0; background-color: White !important;`;', 'white'],
  ['const rule = css`a { border-color: navy }`;', 'navy'],
  ['const Icon = styled.svg`fill: ${size}; stroke: teal;`;', 'teal'],
];

const otherExtensions = ['geometry.ts', 'geometry.mts', 'geometry.js', 'geometry.mjs'].flatMap(
  (name) =>
    invalid(
      [
        ["export const stroke = { color: '#fff' };", '#fff'],
        ["export const note = 'color: #fff';", '#fff'],
        ["export const note = 'margin: 0; color: #fff';", '#fff'],
        ["export const note = 'a { color: #fff }';", '#fff'],
        ["export const shadow = 'rgba(0, 0, 0, 0.2)';", 'rgba(0, 0, 0, 0.2)'],
        ["export const fill = { fill: '#336699' };", '#336699'],
        ["export const box = styled.div({ color: 'red' });", 'red'],
        ['export const rule = css`color: #fff;`;', '#fff'],
      ],
      `/repo/src/main/map/${name}`,
    ),
);

tester.run('react-no-hardcoded-colors', reactNoHardcodedColors, {
  valid: [
    ...valid,
    ...["export const fill = { fill: 'red', color: 'black' };", "export const hash = '#add';"].map(
      (code) => ({ filename: '/repo/src/main/map/geometry.ts', code }),
    ),
  ],
  invalid: [
    ...invalid(hexAndFunctions),
    ...invalid(styleContexts),
    ...invalid(attributesAndDeclarations),
    ...invalid(templates),
    ...otherExtensions,
    ...invalid([['const Title = styled.h1`color: #fff;`;', '#fff']], '/repo/src/main/ui/theme.ts'),
    ...invalid([
      [
        "const style = { color: '#fff', background: '#336699', borderColor: 'rgb(0 0 0)' };",
        ['#fff', '#336699', 'rgb(0 0 0)'],
      ],
      ['const rule = css`color: #fff; background: #000;`;', '#fff'],
    ]),
  ],
});
