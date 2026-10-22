import { ESLint } from 'eslint';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { rule } from './react-no-effect-data-fetching.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-async-effects-'));
const ruleName = 'nitpicker/react-no-effect-data-fetching';

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.tsx'],
      languageOptions: { parser: tseslint.parser },
      plugins: { nitpicker: { rules: { 'react-no-effect-data-fetching': rule } } },
      rules: { [ruleName]: 'error' },
    },
  ],
});

const typed = new ESLint({
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
      plugins: { nitpicker: { rules: { 'react-no-effect-data-fetching': rule } } },
      rules: { [ruleName]: 'error' },
    },
  ],
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

async function lint(body) {
  const code = `import { useEffect, useState } from 'react';\nexport function Panel({ id }: { id: string }) {\n  const [name, setName] = useState('');\n  useEffect(() => {\n    ${body}\n  }, [id]);\n  return <div>{name}</div>;\n}`;
  const [result] = await eslint.lintText(code, { filePath: path.join(root, 'src/panel.tsx') });
  return result.messages;
}

async function messageIds(body) {
  return (await lint(body)).map((message) => message.messageId);
}

describe('async work in an effect', () => {
  it.each([
    [
      'an await in a helper the effect calls',
      'async function run() { setName(await load(id)); } void run();',
    ],
    ['an async IIFE', 'void (async () => { const user = await load(id); setName(user); })();'],
    ['a then callback', 'void load(id).then((user) => { if (user) { setName(user); } });'],
    ['a setter passed to then', 'void load(id).then(setName);'],
    [
      'an async timer callback the effect starts',
      'const timer = setTimeout(async () => { setName(await load(id)); }, 300); return () => { clearTimeout(timer); };',
    ],
    [
      'a timer inside an awaiting IIFE',
      'void (async () => { await ready(); requestAnimationFrame(() => { setName(id); }); })();',
    ],
  ])('reports %s whose result reaches state', async (_name, body) => {
    expect(await messageIds(body)).toEqual(['asyncInEffect']);
  });

  it.each([
    ['a fire-and-forget promise', 'void load(id);'],
    ['an animation started by the effect', 'animate(scope.current, { opacity: 1 });'],
    ['a language switch', 'void changeLanguage(id);'],
    ['an await whose result stays outside state', 'void (async () => { await track(id); })();'],
    [
      'a setter that runs before the await',
      'void (async () => { setName(""); await track(id); })();',
    ],
    [
      'a listener the effect only registers',
      'async function onKey() { setName(await load(id)); } window.addEventListener("keydown", onKey); return () => { window.removeEventListener("keydown", onKey); };',
    ],
    ['a synchronous setter', 'setName(id);'],
  ])('lets %s through, which syncs with an external system', async (_name, body) => {
    expect(await messageIds(body)).toEqual([]);
  });

  it('reports one finding for an effect, at its first async step', async () => {
    const messages = await lint(
      'void load(id).then(setName);\n    void (async () => { setName(await load(id)); })();',
    );

    expect(messages.map(({ line }) => line)).toEqual([5]);
  });

  it('lets async work outside an effect through', async () => {
    const code = `import { useState } from 'react';\nexport function Panel({ id }: { id: string }) { const [name, setName] = useState(''); const save = async () => { setName(await load(id)); }; return <button onClick={save}>{name}</button>; }`;
    const [result] = await eslint.lintText(code, { filePath: path.join(root, 'src/panel.tsx') });

    expect(result.messages).toEqual([]);
  });

  it('names the handler and the redirect form next to the query', async () => {
    const [message] = await lint('void load(id).then(setName);');

    expect(message.message).toBe(
      'Do not load state asynchronously in `useEffect` (a state setter after `await` or in a `.then` callback): it races the render and nothing caches the result. Load data with `useQuery` or a route loader; run an action (a save, a clipboard write) in the event handler that causes it; redirect by rendering `<Navigate />`. If this effect only synchronizes with an external system, add an exception for this rule in nitpicker.config.json.',
    );
  });
});

describe('requests in an effect', () => {
  it.each([
    [
      'a request in the effect',
      'void (async () => { setName(await (await fetch(`/x/${id}`)).text()); })();',
    ],
    [
      'a request in a timer the effect starts',
      'const timer = setTimeout(() => { void fetch("/x"); }, 10); return () => { clearTimeout(timer); };',
    ],
  ])('reports %s once, as a request', async (_name, body) => {
    expect(await messageIds(body)).toEqual(['fetchInEffect']);
  });

  it('lets a beacon in a handler the effect only registers through', async () => {
    const body =
      'function onLeave() { void fetch("/beacon", { method: "POST", keepalive: true }); } window.addEventListener("pagehide", onLeave); return () => { window.removeEventListener("pagehide", onLeave); };';

    expect(await messageIds(body)).toEqual([]);
  });
});

describe('promise-returning calls with type information', () => {
  it('lets an animation and a language switch through, though both return promises', async () => {
    const code = `import { useEffect } from 'react';\ndeclare function changeLanguage(locale: string): Promise<string>;\ndeclare function animate(target: unknown, to: object): Promise<void> & { stop(): void };\nexport function Panel({ id }: { id: string }) { useEffect(() => { void changeLanguage(id); void animate(id, { opacity: 1 }); }, [id]); return <div />; }`;
    const [result] = await typed.lintText(code, { filePath: path.join(root, 'src/locale.tsx') });

    expect(result.messages).toEqual([]);
  });
});
