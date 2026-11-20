import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { createReactRuleTester } from '../test-support/tester.mts';
import { rule } from './react-no-uncached-use-promise.mts';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-use-promise-'));
const files: Readonly<Record<string, string>> = {
  'spa/package.json': '{"name":"spa","dependencies":{"react":"19.0.0"}}',
  'spa/src/api.ts': [
    'export async function loadUser(id: string) { return { name: id }; }',
    'export const loadTeam = async (id: string) => ({ name: id });',
    'export const loadRole = async function (id: string) { return { name: id }; };',
    'export default async function loadAll() { return []; }',
    'export function readUser(id: string) { return cached.get(id); }',
    'export const loadCached = cache(async (id: string) => ({ name: id }));',
    'async function hidden() { return 1; }',
  ].join('\n'),
  'site/package.json': '{"name":"site","dependencies":{"next":"15.0.0"}}',
  'mixed/package.json': '{"name":"mixed"}',
  'mixed/src/button.tsx': "'use client';\nexport const Button = () => null;",
};
for (const [file, text] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const spa = path.join(root, 'spa/src/profile.tsx');
const site = path.join(root, 'site/app/profile.tsx');
const mixed = path.join(root, 'mixed/src/profile.tsx');
const local = `async function loadLocal(id) { return { name: id }; }
const loadArrow = async (id) => ({ name: id });
async function loadMemo(id) { return { name: id }; }
loadMemo = memoize(loadMemo);
const loadOnce = cache(async (id) => ({ name: id }));
function readLocal(id) { return store.read(id); }`;

function profile(body: string, head = '') {
  return `${head}import { use, useMemo, useState } from 'react';
import loadAll, { loadCached, loadRole, loadTeam, loadUser, readUser } from './api';
import { loadRemote } from 'remote-package';
import { loadMissing } from './missing';
${local}
export function Profile({ id, userPromise }) { ${body} return <h1>{user.name}</h1>; }`;
}

function invalid(body: string, source: string, filename = spa, head = '') {
  return {
    filename,
    code: profile(body, head),
    errors: [{ messageId: 'uncached', data: { source } }],
  };
}

const tester = createReactRuleTester();
const asyncSource = (name: string) => `\`${name}\` is an async function and returns`;

tester.run('react-no-uncached-use-promise', rule, {
  valid: [
    'const user = use(userPromise);',
    'const user = use(UserContext);',
    'const user = use(readUser(id));',
    'const user = use(readLocal(id));',
    'const user = use(loadOnce(id));',
    'const user = use(loadMemo(id));',
    'const user = use(loadRemote(id));',
    'const user = use(loadMissing(id));',
    'const user = use(loadCached(id));',
    'const user = use(hidden(id));',
    'const user = use(fetch(id));',
    'const user = use(Promise.resolve(userPromise));',
    'const promise = useMemo(() => loadUser(id), [id]); const user = use(promise);',
    'const [promise] = useState(() => loadUser(id)); const user = use(promise);',
    'const user = use(api.loadUser(id));',
    'const user = wrap(loadUser(id));',
    'const user = store.use(loadUser(id));',
    'const loadUser = props.loader; const user = use(loadUser(id));',
  ]
    .map((body) => ({ filename: spa, code: profile(body) }))
    .concat([
      { filename: site, code: profile('const user = use(loadLocal(id));') },
      { filename: mixed, code: profile('const user = use(loadLocal(id));') },
      {
        filename: spa,
        code: `import { use } from 'react';
async function loadLocal(id) { return { name: id }; }
export async function Profile({ id }) { const user = use(loadLocal(id)); return <h1>{user.name}</h1>; }`,
      },
      {
        filename: spa,
        code: `async function loadLocal(id) { return { name: id }; }
export function Profile({ id }) { const user = use(loadLocal(id)); return <h1>{user.name}</h1>; }`,
      },
    ]),
  invalid: [
    invalid('const user = use(loadLocal(id));', asyncSource('loadLocal')),
    invalid('const user = use(loadArrow(id));', asyncSource('loadArrow')),
    invalid('const user = use(loadUser(id));', asyncSource('loadUser')),
    invalid('const user = use(loadTeam(id));', asyncSource('loadTeam')),
    invalid('const user = use(loadAll());', asyncSource('loadAll')),
    invalid('const user = use(loadRole(id));', asyncSource('loadRole')),
    invalid('const user = use(userPromise.finally(done));', '`.finally(...)` returns'),
    invalid(
      'const user = use(Promise.allSettled([userPromise]));',
      '`Promise.allSettled(...)` returns',
    ),
    invalid('const user = use(loadUser(id) as Promise<User>);', asyncSource('loadUser')),
    invalid('const promise = loadUser(id); const user = use(promise);', asyncSource('loadUser')),
    invalid(
      'const user = use(new Promise((resolve) => { resolve(id); }));',
      '`new Promise(...)` builds',
    ),
    invalid(
      'const user = use((async () => ({ name: id }))());',
      'The inline async function returns',
    ),
    invalid('const user = use(userPromise.then((value) => value.user));', '`.then(...)` returns'),
    invalid(
      'const user = use(fetch(id).then((response) => response.json()));',
      '`.then(...)` returns',
    ),
    invalid(
      'const user = use(Promise.all([userPromise, readUser(id)]));',
      '`Promise.all(...)` returns',
    ),
    invalid('const user = use(loadLocal(id));', asyncSource('loadLocal'), site, "'use client';\n"),
    invalid(
      'const [open] = useState(false); const user = use(loadLocal(id));',
      asyncSource('loadLocal'),
      mixed,
    ),
    {
      filename: site,
      code: `import { use as read, useRef } from 'react';
async function loadLocal(id) { return { name: id }; }
export function Profile({ id }) { const seen = useRef(0); const user = read(loadLocal(id)); return <h1>{user.name}</h1>; }`,
      errors: [{ messageId: 'uncached', data: { source: asyncSource('loadLocal') } }],
    },
    {
      filename: spa,
      code: `import * as React from 'react';
async function loadLocal(id) { return { name: id }; }
export function Profile({ id }) { const user = React.use(loadLocal(id)); return <h1>{user.name}</h1>; }`,
      errors: [{ messageId: 'uncached', data: { source: asyncSource('loadLocal') } }],
    },
  ],
});
