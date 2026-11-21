import { createReactRuleTester, filename } from '../test-support/tester.mts';
import { rule } from './react-no-stale-state-update.mts';

const tester = createReactRuleTester();

function inPanel(body: string) {
  return `import { useEffect, useState } from 'react';
export function Panel({ api, item }) {
  const [items, setItems] = useState<string[]>([]);
  const [form, setForm] = useState({ name: '', dirty: false });
  const [page, setPage] = useState(0);
  ${body}
  return <button type="button" onClick={run}>{items.length + page}{form.name}</button>;
}`;
}

function valid(body: string) {
  return { filename, code: inPanel(body) };
}

function invalid(body: string, messageId: 'afterAwait' | 'repeated', state: string) {
  const setter = `set${state.charAt(0).toUpperCase()}${state.slice(1)}`;
  return { filename, code: inPanel(body), errors: [{ messageId, data: { state, setter } }] };
}

tester.run('react-no-stale-state-update', rule, {
  valid: [
    'const run = async () => { await api.save(); setPage((current) => current + 1); };',
    'const run = async () => { setPage(page + 1); await api.save(); };',
    'const run = async () => { const next = await api.load(); setItems(next); };',
    'const run = async () => { await api.save(); setItems([item]); };',
    'const run = async () => { await api.save(); setPage(0); };',
    'const run = async () => { await api.save(); setForm({ name: item, dirty: false }); };',
    'const run = async () => { if (item) { await api.save(); return; } setPage(page + 1); };',
    'const run = async () => { const done = item && (await api.save()); setPage(page + 1); };',
    'const run = async () => { for (const each of items) { await api.save(each); } setPage(page + 1); };',
    'const run = async () => { try { api.check(); } catch { await api.report(); } setPage(page + 1); };',
    'const run = async () => { try { await api.save(); } catch { setItems([...items, item]); } };',
    'const run = async () => { const later = async () => { await api.save(); }; setPage(page + 1); };',
    'const run = async () => { await api.save(); return () => { setPage(page + 1); }; };',
    'const run = async () => { const page = await api.page(); setPage(page + 1); };',
    'const run = async () => { const items = await api.load(); setItems([...items, item]); };',
    'const run = async () => { await api.save(); setPage(page === 0); };',
    'const run = async () => { await api.save(); setItems(items.concat(item)); };',
    'const run = async () => { await api.save(); api.setPage(page + 1); };',
    'const run = async () => { block: { if (item) { break block; } await api.save(); } setPage(page + 1); };',
    'const run = async () => { api.hook?.(await api.save()); setPage(page + 1); };',
    'const run = async () => { let saved = api.saved; saved ||= await api.save(); setPage(page + 1); };',
    'const run = async () => { try { api.check(); await api.save(); } catch { api.report(); } setPage(page + 1); };',
    'useEffect(() => { let cancelled = false; const run = async () => { await api.save(); if (cancelled) { return; } setForm({ ...form, dirty: false }); }; void run(); return () => { cancelled = true; }; }, [form]); const run = () => {};',
    'const run = async () => { if (await api.ok()) { api.log(); } setPage(page + 1); };',
    'const run = () => { setPage(page + 1); };',
    'const run = () => { setItems([...items, item]); setPage(page + 1); };',
    'const run = () => { setForm({ ...form, name: item }); setForm({ name: "", dirty: false }); };',
    'const run = () => { setForm((current) => ({ ...current, name: item })); setForm((current) => ({ ...current, dirty: true })); };',
    'const run = () => { if (item) { setPage(page + 1); } else { setPage(page - 1); } };',
    'const run = () => { if (item) { setPage(0); } setPage(page + 1); };',
    'const run = () => { setPage(0); return () => { setPage(page + 1); }; };',
    'const run = () => { const setPage = api.pager(); setPage(page + 1); setPage(page + 2); };',
    'const [other, setOther] = api.useState(0); const run = () => { setOther(1); setOther(other + 1); };',
  ].map(valid),
  invalid: [
    invalid(
      'const run = async () => { await api.save(); setPage(page + 1); };',
      'afterAwait',
      'page',
    ),
    invalid(
      'const run = async () => { const tag = await api.create(item); setItems([...items, tag.id]); };',
      'afterAwait',
      'items',
    ),
    invalid(
      'const run = async () => { await api.save(); setForm({ ...form, dirty: false }); };',
      'afterAwait',
      'form',
    ),
    invalid(
      'async function run() { try { await api.save(); } catch { api.report(); } setPage(page + 1); }',
      'afterAwait',
      'page',
    ),
    invalid(
      'const run = async () => { const more = await api.load(); if (more.length > 0) { setItems([...items, ...more] as string[]); } };',
      'afterAwait',
      'items',
    ),
    invalid(
      'const run = async () => { await api.save(); setForm({ name: form.name.trim(), dirty: false }); };',
      'afterAwait',
      'form',
    ),
    invalid(
      'useEffect(() => { const run = async () => { await api.save(); setPage(page + 1); }; void run(); }, [item]); const run = () => {};',
      'afterAwait',
      'page',
    ),
    invalid(
      'const run = async () => { try { await api.save(); api.done(); } finally { api.close(); } setPage(page + 1); };',
      'afterAwait',
      'page',
    ),
    invalid(
      'const run = () => { setForm({ ...form, name: item }); setForm({ ...form, dirty: true }); };',
      'repeated',
      'form',
    ),
    invalid('const run = () => { setPage(0); api.log(); setPage(page + 1); };', 'repeated', 'page'),
    invalid(
      'const run = () => { setItems((current) => [...current, item]); setItems([...items, item]); };',
      'repeated',
      'items',
    ),
  ],
});
