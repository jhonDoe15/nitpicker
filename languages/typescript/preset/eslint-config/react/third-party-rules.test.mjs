import { ESLint } from 'eslint';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveLayout } from '../../layout.mjs';
import { reactScopeConfigFor } from '../react-scope.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-react-third-party-'));
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.tsx'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          projectService: { allowDefaultProject: ['src/*.tsx'] },
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
  return result.messages.map(({ ruleId }) => ruleId);
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
  ])('lets %s through', async (_name, body) => {
    const code = `import { useEffect, useRef, useState } from 'react'; export function Panel({ items }: { items: number[] }) { ${body} return <div />; }`;

    expect(await ruleIdsFor(code)).toEqual([]);
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
    expect(result.messages[0].message).toContain('count > 0 &&');
    expect(result.messages[0].message).toContain('nitpicker.config.json');
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
