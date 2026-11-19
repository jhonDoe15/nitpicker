import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule as ioInLoop } from '../no-io-in-loop.mts';

const ruleTester = typescriptRuleTester();

function reported(messageId: string, count = 1) {
  return (code: string) => ({
    code,
    errors: Array.from({ length: count }, () => ({ messageId })),
  });
}

ruleTester.run('no-io-in-loop polling and re-reads', ioInLoop, {
  valid: cases([
    'const deadline = Date.now() + timeout; while (Date.now() < deadline) { const status = await client.getStatus(job); if (status.done) break; await sleep(500); }',
    "for (;;) { const current = await client.snapshot.get(name); if (current.state === 'active') { return true; } await new Promise((resolve) => setTimeout(resolve, 1000)); }",
    'for (let attempt = 0; attempt < 5; attempt++) { const response = await fetch(url); if (response.ok) { return response; } await delay(2 ** attempt * 100); }',
    'let ready = false; while (!ready) { ready = (await api.poll(job)).ready; await sleep(100); }',
    'const started = Date.now(); do { const state = await repository.findOne({ where: { id: jobId } }); if (state.finished) break; } while (Date.now() - started < limit);',
    'while (!isDone) { const run = await this.runRepository.findOneBy({ id: runId }); isDone = run.status === "done"; await this.wait(1000); }',
    'for (let tries = 0; tries < 3; tries++) { const row = await db.query("select 1 where id = $1", [id]); if (row) { return row; } await backoff(tries); }',
  ]),
  invalid: [
    ...[
      'while (queue.length) { const id = queue.shift(); await api.get(id); await sleep(100); }',
      'for (let i = 0; i < ids.length; i++) { await api.get(ids[i]); await sleep(100); }',
      'for (const id of ids) { await api.get(id); await sleep(100); }',
      'let i = 0; while (i < urls.length) { await api.get(urls[i], { timeout }); i++; await sleep(10); }',
      'let i = 0; while (i < urls.length) { await api.get(urls[i]); i += 1; await sleep(10); }',
      'let i = 0; while (i < urls.length) { await api.get(urls[i]); i = i + 1; await sleep(10); }',
      'while (more()) { await api.list(); }',
      'for (const id of ids) { const deadline = Date.now() + 1000; await api.get(id); }',
      'ids.forEach(async (id) => { await api.get(id); await sleep(100); });',
    ].map(reported('request')),
    ...[
      "let item; while ((item = queue.shift())) { await pool.query('s', [item]); await sleep(10); }",
      "while (queue.length) { await pool.query('s', [queue.pop()]); await sleep(10); }",
      "let cur = head; while (cur) { await pool.query('d', [cur.id]); cur = cur.next; await sleep(100); }",
      "for (const id of ids) { while (!done) { await pool.query('s', [id]); await sleep(10); } }",
      "let item; while (item = queue.pop()) { await pool.query('s', [item.id]); await sleep(10); }",
      "let item; while (more) { item = it.next(); await pool.query('s', [item]); await sleep(10); }",
    ].map(reported('query')),
  ],
});

ruleTester.run('no-io-in-loop re-read after a conflict', ioInLoop, {
  valid: [],
  invalid: [
    ...[
      'for (const tag of tags) { try { await repo.insert(tag); } catch { const existing = await repo.findOne({ where: { name: tag.name } }); use(existing); } }',
      'for (const tag of tags) { try { await this.tagRepository.save(tag); } catch (error) { if (isUnique(error)) { await this.tagRepository.findOneBy({ name: tag.name }); } } }',
      'for (const user of users) { try { await prisma.user.create({ data: user }); } catch (error) { await prisma.user.findUnique({ where: { email: user.email } }); } }',
    ].map(reported('query')),
    ...[
      'for (const tag of tags) { try { await repo.insert(tag); } catch { await otherRepo.findOne({ where: { name: tag.name } }); } }',
      'for (const tag of tags) { try { validate(tag); } catch { await repo.findOne({ where: { name: tag.name } }); } await repo.save(tag); }',
    ].map(reported('query', 2)),
  ],
});
