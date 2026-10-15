import { rule as accumulatorSpread } from './no-accumulator-spread-in-reduce.mjs';
import { rule as ioInLoop } from './no-io-in-loop.mjs';
import { cases, createRuleTester } from '../support/rule-tester.mjs';

const ruleTester = createRuleTester();

const inLoop = (statement) => `for (const id of ids) { ${statement} }`;
const inMap = (statement) => `ids.map((id) => ${statement});`;

ruleTester.run('no-io-in-loop', ioInLoop, {
  valid: cases([
    'const found = await repository.findByIds(ids);',
    'for (const id of ids) { total += id; }',
    'for (const id of await repository.findByIds(ids)) { use(id); }',
    inLoop('cache.get(id);'),
    inLoop('items.find(id);'),
    inLoop('map.get(id);'),
    inLoop('const r = format(id);'),
    inMap('lookup(id)'),
    inMap('table.get(id)'),
    "import path from 'node:path'; for (const id of ids) { path.join(id); }",
    "import type { Pool } from 'pg'; for (const id of ids) { Pool(id); }",
    'function fetchAll() { return repository.findAll(); } for (const id of ids) { use(id); }',
    'for (const attempt of attempts) { try { return await client.get(url); } catch (error) { wait(attempt); } }',
    'for (const attempt of attempts) { try { const r = await fetch(url); break; } catch { wait(); } }',
    'ids.forEach(function () { return 1; }); const run = () => repository.findAll();',
    'for (let attempt = 1; attempt <= 3; attempt++) { try { return await client.get(url); } catch { wait(); } }',
    'while (retries-- > 0) { try { await api.send(body); break; } catch { wait(); } }',
    inLoop('form.update(id);'),
    inLoop('platform.getName(id);'),
    inLoop('item.updateTotal(id);'),
    inLoop('apiResponse.get(id);'),
    inLoop('repository.findings.push(id);'),
    inLoop('queryClient.getQueryData(id);'),
    inLoop('element.getBoundingClientRect();'),
    inLoop('viewModel.update(id);'),
    inLoop('httpClient.getHeaders(id);'),
    inLoop('try { return await repository.findById(id); } catch { log(); }'),
    'for (const entry of entries) { try { await repository.save(entry); break; } catch { log(); } }',
    'await Promise.all(ids.map(async (id) => { return await repository.findById(id); }));',
    'await Promise.all(ids.map((id) => fetch(`/api/${id}`)));',
    'let page; do { page = await repository.findPage(cursor); cursor = page.next; } while (cursor);',
    'let cursor; do { const res = await api.list({ cursor }); cursor = res.next; } while (cursor);',
    'let done = false; while (!done) { const r = await client.poll(job); done = r.finished; }',
  ]),
  invalid: [
    ...[
      inLoop('await repository.findById(id);'),
      inLoop('const user = await this.userRepo.findOne({ id });'),
      inLoop('await db.query("select 1", [id]);'),
      inLoop('await prisma.user.findMany({ where: { id } });'),
      inLoop('await fetch(`/api/${id}`);'),
      inLoop('await axiosClient.get(id);'),
      inLoop('results.push(await orders.client.post(id));'),
      "import { readFile } from 'node:fs/promises'; for (const id of ids) { await readFile(id); }",
      "import fs from 'fs'; for (const id of ids) { fs.writeFileSync(id, ''); }",
      "import * as fsp from 'node:fs/promises'; ids.forEach((id) => fsp.rm(id));",
      "import got from 'got'; ids.map((id) => got(id));",
      inMap('repository.findById(id)'),
      inMap('db.query(id)'),
      'ids.forEach(async (id) => { await userRepository.save(id); });',
      'ids.flatMap((id) => userDao.listByOwner(id));',
      'while (more()) { client.send(1); }',
      'for (let i = 0; i < 3; i++) { api.fetchPage(i); }',
      'do { gateway.write(1); } while (more());',
      inLoop('try { await repository.save(id); } catch { log(); }'),
      inLoop('try { return await repository.findById(id); } catch (error) { throw error; }'),
      inLoop('await repository.getById(id);'),
      inLoop('await httpClient.get(id);'),
      'while (more()) { const page = await api.list(); use(page); }',
      'for (const attempt of attempts) { await repository.save(attempt); }',
    ].map((code) => ({ code, errors: [{ messageId: 'call' }] })),
    {
      code: inLoop('await userRepository.findById(id);'),
      errors: [{ messageId: 'call', data: { callee: 'userRepository.findById()' } }],
    },
  ],
});

ruleTester.run('no-accumulator-spread-in-reduce', accumulatorSpread, {
  valid: cases([
    'items.reduce((sum, item) => sum + item.price, 0);',
    'items.reduce((acc, item) => ({ ...item, total: acc.total }), start);',
    'const copy = { ...state };',
    'const all = [...left, ...right];',
    'items.reduce((acc, item) => [...item.tags, ...acc.slice(1)], []);',
    'items.reduce(combine, {});',
    'items.map((acc) => ({ ...acc }));',
  ]),
  invalid: [
    'items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {});',
    'items.reduce((acc, item) => [...acc, item.id], []);',
    'items.reduceRight((acc, item) => [item.id, ...acc], []);',
    'items.reduce(function (map, item) { return { ...map, [item.id]: item }; }, {});',
    'items.reduce((acc, item) => { acc.total += 1; return { ...acc, last: item }; }, {});',
  ].map((code) => ({ code, errors: [{ messageId: 'spread' }] })),
});
