import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-dataloader-batch-mismatch.mts';

const head = "import DataLoader from 'dataloader';\n";

typescriptRuleTester().run('no-dataloader-batch-mismatch', rule, {
  valid: cases([
    `${head}new DataLoader(async (keys) => { const unique = [...new Set(keys)]; if (unique.length === 0) { return []; } const byId = await load(unique); return keys.map((key) => byId.get(key) ?? null); });`,
    `${head}new DataLoader(async (keys) => db.query('select * from t where id = any($1)', [keys]));`,
    `${head}new DataLoader(async (keys) => cache.getMany(keys));`,
    `${head}new DataLoader(async (keys) => { const byId = new Map(keys.map((key) => [key, null])); for (const row of await load(keys)) { byId.set(row.id, row); } return keys.map((key) => byId.get(key)!); });`,
    `${head}new DataLoader(async (keys) => { const byId = await load(keys); return keys.map((key) => { if (typeof key !== 'string') { throw new TypeError('key'); } return byId.get(key) ?? null; }); });`,
    `${head}new DataLoader(async (keys) => { const rows = await db.user.findMany({ where: { id: { in: keys } } }); const byId = new Map(rows.map((row) => [row.id, row])); return keys.map((key) => byId.get(key) ?? null); });`,
    `${head}new DataLoader(async (keys) => { const rows = await db.user.findMany(); return keys.map((key) => rows.find((row) => row.id === key) ?? new Error('missing')); });`,
    `${head}new DataLoader(async (keys) => { if (keys.length === 0) { return []; } const byId = await load(keys); return keys.map((key) => byId.get(key) ?? null); });`,
    `${head}async function batchUsers(keys) { const byId = await load(keys); return keys.map((key) => byId.get(key) ?? null); }\nnew DataLoader(batchUsers);`,
    `${head}new DataLoader(async (keys) => { const result = await Promise.all(keys.map((key) => fetchOne(key))); return result; });`,
    `${head}new DataLoader(async (keys) => ordered(keys, await db.user.findMany()));`,
    `${head}new DataLoader(async (keys) => { const found = await db.user.findMany(); const lookup = new Map(found.map((u) => [u.id, u])); return keys.map((k) => lookup.get(k)); });`,
    "import DataLoader from 'other-loader';\nnew DataLoader(async (keys) => []);",
    'const Loader = class {};\nnew Loader(async (keys) => []);',
    `${head}new DataLoader(async (keys) => keys.map((key) => key.toString()));`,
    `${head}function other(keys) { return []; }\nnew DataLoader(async (keys) => keys.map((key) => key));`,
  ]),
  invalid: [
    {
      code: `${head}new DataLoader(async (keys) => { const byId = await load(keys); return keys.map((key) => { const row = byId.get(key); if (!row) { throw new Error('missing'); } return row; }); });`,
      messageId: 'lookup',
    },
    {
      code: `${head}function notFound(key) { throw new Error(key); }\nnew DataLoader(async (keys) => { const byId = await load(keys); return keys.map((key) => byId.get(key) ?? notFound(key)); });`,
      messageId: 'lookup',
    },
    {
      code: `${head}new DataLoader(async (keys) => { const rows = await db.user.findMany({ where: { id: { in: keys } } }); return rows; });`,
      messageId: 'unmapped',
    },
    {
      code: `${head}new DataLoader(async (keys) => db.user.findMany({ where: { id: { in: keys } } }));`,
      messageId: 'unmapped',
    },
    {
      code: `${head}new DataLoader(async (keys) => { const rows = await repo.findByIds(keys); return rows.map((row) => toDto(row)); });`,
      messageId: 'unmapped',
    },
    {
      code: `${head}new DataLoader(async (keys) => { const rows = await db.user.findMany(); return []; });`,
      messageId: 'empty',
    },
    {
      code: `${head}new DataLoader(async (keys) => { const byId = await load(keys); return keys.map((key) => byId.get(key)!); });`,
      messageId: 'lookup',
    },
    {
      code: `${head}new DataLoader(async (keys) => { const rows = await load(keys); return Promise.all(keys.map(async (id) => rows.find((row) => row.id === id)!)); });`,
      messageId: 'lookup',
    },
    {
      code: `${head}async function batchUsers(ids) { const byId = await load(ids); const out = ids.map((id) => byId.get(id)!); return out; }\nnew DataLoader(batchUsers);`,
      messageId: 'lookup',
    },
    {
      code: "const DataLoader = require('dataloader');\nnew DataLoader(async (keys) => { const rows = await db.user.findMany(); return rows; });",
      messageId: 'unmapped',
    },
    {
      code: "import Loader from 'dataloader';\nnew Loader<string, User>(async (keys: readonly string[]) => { const rows = await db.user.findMany(); return rows; });",
      messageId: 'unmapped',
    },
  ].map(({ code, messageId }) => ({ code, errors: [{ messageId }] })),
});
