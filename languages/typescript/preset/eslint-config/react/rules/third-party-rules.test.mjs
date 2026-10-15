import { ESLint } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveLayout } from '../../../layout.mjs';
import { reactScopeConfigFor } from '../react-scope.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-react-third-party-'));
mkdirSync(path.join(root, 'src'));
writeFileSync(path.join(root, 'placeholder.ts'), 'export {};');
symlinkSync(
  path.resolve(import.meta.dirname, '../../../../../../node_modules'),
  path.join(root, 'node_modules'),
);
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      jsx: 'react-jsx',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      target: 'ES2022',
      lib: ['ES2022', 'DOM'],
      types: [],
    },
    files: ['placeholder.ts'],
  }),
);
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.tsx'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          projectService: { allowDefaultProject: ['src/*.tsx'], defaultProject: 'tsconfig.json' },
          tsconfigRootDir: root,
        },
      },
    },
    ...(await reactScopeConfigFor(resolveLayout(), {}, root)),
  ],
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

async function ruleIdsFor(code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, 'src/panel.tsx') });
  return result.messages.map(({ ruleId, message }) => ruleId ?? message);
}

describe('rules from the React plugins', () => {
  it.each([
    [
      'a copied state update',
      'const [list, setList] = useState<number[]>([]); const add = () => { setList([...list, 1]); };',
    ],
    ['a sorted copy of a prop', 'const sorted = items.toSorted();'],
    ['an effect that cleans up its listener', cleanedListener()],
    ['a ref read in a handler', 'const ref = useRef(0); const read = () => ref.current;'],
    [
      'the lazy-init idiom for a ref',
      'const seen = useRef<Set<number> | null>(null); if (seen.current === null) { seen.current = new Set(); }',
    ],
  ])('lets %s through', async (_name, body) => {
    const code = `import { useEffect, useRef, useState } from 'react'; export function Panel({ items }: { items: number[] }) { ${body} return <div />; }`;

    expect(await ruleIdsFor(code)).toEqual([]);
  });

  it('reports a ref read during render after the lazy init', async () => {
    const code = `import { useRef } from 'react'; export function Panel() { const seen = useRef<Set<number> | null>(null); if (seen.current === null) { seen.current = new Set(); } return <p>{seen.current.size}</p>; }`;

    const [result] = await eslint.lintText(code, { filePath: path.join(root, 'src/panel.tsx') });

    expect(result.messages.map(({ ruleId }) => ruleId)).toEqual(['react-x/refs']);
    expect(result.messages[0].message).toContain(
      'render may only run the lazy init `if (ref.current === null) ref.current = new X()`',
    );
  });

  it('lets keyed lists, memoised context values and hoisted defaults through', async () => {
    const code = [
      "import { createContext, useMemo } from 'react';",
      'const ThemeContext = createContext({ dark: false });',
      'const none: number[] = [];',
      "export function List({ items = none, dark }: { items?: number[]; dark: boolean }) { const value = useMemo(() => ({ dark }), [dark]); return <ThemeContext value={value}><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul><button type='button'>go</button></ThemeContext>; }",
    ].join('\n');

    expect(await ruleIdsFor(code)).toEqual([]);
  });

  it('reports a number rendered with && and names the comparison', async () => {
    const code =
      'export function Badge({ count }: { count: number }) { return <div>{count && <p>{count}</p>}</div>; }';
    const [result] = await eslint.lintText(code, { filePath: path.join(root, 'src/badge.tsx') });

    expect(result.messages.map(({ ruleId }) => ruleId)).toEqual([
      'react-x/no-leaked-conditional-rendering',
    ]);
    expect(result.messages[0].message).toBe(
      'Potential leaked value count that might cause unintentionally rendered values or rendering crashes. Compare explicitly (`count > 0 && <Badge />`) or use a ternary. If this is intentional, add an exception for this rule in nitpicker.config.json.',
    );
  });

  it('lets a JSX handler return a void call and still flags other shorthand returns', async () => {
    const handler =
      "import { useState } from 'react'; export function Title() { const [title, setTitle] = useState(''); return <input aria-label='Title' value={title} onChange={(event) => setTitle(event.target.value)} />; }";
    const shorthand =
      'const log = (value: string): void => { console.info(value); }; export const run = (value: string) => log(value);';

    expect(await ruleIdsFor(handler)).toEqual([]);
    expect(await ruleIdsFor(shorthand)).toEqual([
      '@typescript-eslint/no-confusing-void-expression',
    ]);
  });

  it('lets a boolean condition render with &&', async () => {
    const code =
      'export function Badge({ shown }: { shown: boolean }) { return <div>{shown && <p>hi</p>}</div>; }';

    expect(await ruleIdsFor(code)).toEqual([]);
  });
});

function cleanedListener() {
  return "useEffect(() => { const onResize = () => undefined; window.addEventListener('resize', onResize); return () => { window.removeEventListener('resize', onResize); }; }, []);";
}
