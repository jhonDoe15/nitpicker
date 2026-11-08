import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-collected-stream-rows.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/thumbnails/adapters/thumbnail-jobs.ts';

const collected = (name) => ({ messageId: 'collectedStream', data: { name } });

tester.run('no-collected-stream-rows', rule, {
  valid: [
    'async function f(repo) { const batch = []; for await (const a of repo.streamAssets()) { batch.push(a); if (batch.length >= 500) { await queue(batch.splice(0)); } } await queue(batch); }',
    'async function f(repo) { let batch = []; for await (const a of repo.streamAssets()) { batch.push(a); if (batch.length >= 500) { await queue(batch); batch = []; } } await queue(batch); }',
    'async function f(repo) { const batch = []; for await (const a of repo.streamAssets()) { batch.push(a); if (batch.length >= 500) { await queue(batch); batch.length = 0; } } await queue(batch); }',
    'async function f(repo) { for await (const a of repo.streamAssets()) { await queue([a]); } }',
    'async function f(repo) { const seen = []; for await (const a of repo.streamAssets()) { seen.push(a); } }',
    'async function f(request) { const chunks = []; for await (const chunk of request) { chunks.push(chunk); } return Buffer.concat(chunks); }',
    'async function f(lines) { const parts = []; for await (const line of lines) { parts.push(line); } return parts.join("\\n"); }',
    'async function f(ids) { const out = []; for await (const row of ids.map(load)) { out.push(row); } return out; }',
    'async function f() { const out = []; for await (const row of [a(), b()]) { out.push(row); } return out; }',
    'async function f(ids) { const pending = Promise.all(ids.map(load)); const out = []; for await (const row of pending) { out.push(row); } return out; }',
    'async function f(repo) { const out = []; for (const a of repo.list()) { out.push(a); } return out; }',
    'async function f(repo) { for await (const a of repo.streamAssets()) { const local = []; local.push(a); use(local); } }',
    'async function f(repo) { const out = []; for await (const a of repo.streamAssets()) { a.children.forEach((c) => out.push(c)); } return out; }',
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      code: 'async function f(repo) { const jobs = []; for await (const asset of repo.streamAssets()) { jobs.push({ id: asset.id }); } await queue(jobs); }',
      errors: [collected('jobs')],
    },
    {
      code: 'async function f(cursor) { let paths = []; for await (const row of cursor) { paths = [...paths, row.path]; } return paths; }',
      errors: [collected('paths')],
    },
    {
      code: 'async function f(walk) { const files: string[] = []; for await (const entry of walk(root)) { if (entry.isFile()) { files.push(entry.path); } } return files.length; }',
      errors: [collected('files')],
    },
  ].map((test) => ({ filename, ...test })),
});
