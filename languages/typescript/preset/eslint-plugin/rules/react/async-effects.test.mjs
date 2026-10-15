import { ESLint } from 'eslint';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { rule } from './react-no-effect-data-fetching.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-async-effects-'));
const ruleName = 'nitpicker/react-no-effect-data-fetching';

function eslintFor(languageOptions) {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.tsx'],
        languageOptions: { parser: tseslint.parser, ...languageOptions },
        plugins: { nitpicker: { rules: { 'react-no-effect-data-fetching': rule } } },
        rules: { [ruleName]: 'error' },
      },
    ],
  });
}

const typed = eslintFor({
  parserOptions: {
    projectService: { allowDefaultProject: ['src/*.tsx'] },
    tsconfigRootDir: root,
  },
});
const untyped = eslintFor({});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

async function messageIds(eslint, body, extra = '') {
  const code = `import { useEffect } from 'react';\n${extra}\nexport function Panel({ id }: { id: string }) { useEffect(() => { ${body} }, [id]); return <div />; }`;
  const [result] = await eslint.lintText(code, { filePath: path.join(root, 'src/panel.tsx') });
  return result.messages.map((message) => message.messageId);
}

const load =
  'async function load(id: string): Promise<string> { return id; }\nfunction sync(id: string): string { return id; }\nconst maybe = (id: string): Promise<string> | undefined => undefined;\nconst nothing = (id: string): undefined => undefined;';

describe('async work in an effect', () => {
  it('reports a promise-returning function called from the effect, with types', async () => {
    expect(await messageIds(typed, 'void load(id);', load)).toEqual(['asyncInEffect']);
  });

  it('reports a function that may return a promise', async () => {
    expect(await messageIds(typed, 'void maybe(id);', load)).toEqual(['asyncInEffect']);
  });

  it('reports the loader-in-a-helper form that moves the await out of sight', async () => {
    expect(
      await messageIds(typed, 'const run = async () => { await load(id); }; void run();', load),
    ).toEqual(['asyncInEffect']);
  });

  it('reports a new Promise', async () => {
    expect(await messageIds(typed, 'void new Promise<void>(() => undefined);')).toEqual([
      'asyncInEffect',
    ]);
  });

  it('reports one finding for an effect, at its first async step', async () => {
    const [result] = await typed.lintText(
      `import { useEffect } from 'react';\n${load}\nexport function Panel({ id }: { id: string }) {\n  useEffect(() => {\n    void load(id);\n    void load(id);\n  }, [id]);\n  return <div />;\n}`,
      { filePath: path.join(root, 'src/panel.tsx') },
    );

    expect(result.messages.map(({ line }) => line)).toEqual([8]);
  });

  it('lets synchronous calls and non-promise results through', async () => {
    expect(await messageIds(typed, 'sync(id); nothing(id);', load)).toEqual([]);
  });

  it('reports an await without type information', async () => {
    expect(
      await messageIds(
        untyped,
        'const run = async () => { await Promise.resolve(); }; void run();',
      ),
    ).toEqual(['asyncInEffect']);
  });

  it('does not guess about calls without type information', async () => {
    expect(await messageIds(untyped, 'void load(id);', load)).toEqual([]);
  });

  it('lets async work outside an effect through', async () => {
    const code = `import { useEffect } from 'react';\n${load}\nexport function Panel({ id }: { id: string }) { const save = async () => { await load(id); }; useEffect(() => { sync(id); }, [id]); return <button onClick={save}>save</button>; }`;
    const [result] = await typed.lintText(code, { filePath: path.join(root, 'src/panel.tsx') });

    expect(result.messages).toEqual([]);
  });

  it('names the handler and the redirect form next to the query for an action', async () => {
    const code = `import { useEffect } from 'react';\nexport function Copy({ text }: { text: string }) { useEffect(() => { void navigator.clipboard.writeText(text); }, [text]); return <div />; }`;
    const [result] = await typed.lintText(code, { filePath: path.join(root, 'src/copy.tsx') });

    expect(result.messages.map(({ message }) => message)).toEqual([
      'Do not run async work in `useEffect` (`await` or a call that returns a promise): it races the render and nothing caches the result. Load data with `useQuery` or a route loader; run an action (a save, a clipboard write) in the event handler that causes it; redirect by rendering `<Navigate />`. If this effect only synchronizes with an external system, add an exception for this rule in nitpicker.config.json.',
    ]);
  });

  it('leaves a request to the fetch finding and does not add a second one', async () => {
    expect(
      await messageIds(typed, 'const run = async () => { await fetch(`/x/${id}`); }; void run();'),
    ).toEqual(['fetchInEffect']);
  });
});
