import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-release-outside-finally.mts';

const tester = typescriptRuleTester();

function invalid(code: string, resource: string, method: string) {
  return { code, errors: [{ messageId: 'outsideFinally' as const, data: { resource, method } }] };
}

tester.run('no-release-outside-finally', rule, {
  valid: [
    'async function run(dataSource) { const runner = dataSource.createQueryRunner(); await runner.connect(); try { await runner.query(sql); } finally { await runner.release(); } }',
    'async function run(pool) { const client = await pool.connect(); try { await client.query(sql); } finally { client.release(); } }',
    'async function run(pool) { await using client = await pool.connect(); await client.query(sql); client.release(); }',
    'async function run(pool) { const client = await pool.connect(); client.release(); }',
    'async function run(pool) { const client = await pool.connect(); log(client); client.release(); }',
    'async function run(pool) { const client = await pool.connect(); sync(); client.release(); }',
    'async function run(pool) { const client = await pool.connect(); try { await client.query(sql); } catch (error) { client.release(); throw error; } client.release(); }',
    'async function run(pool) { const client = await pool.connect(); try { await client.query(sql); } catch { log(); } client.release(); }',
    'async function run(pool) { const client = await pool.connect(); await client.query(sql); return client; }',
    'async function run(pool) { const client = await pool.connect(); this.client = client; await client.query(sql); client.release(); }',
    'async function run(pool) { const client = await pool.connect(); pool.track(client); await work(); client.release(); }',
    'async function run(pool) { const client = await pool.connect(); const hold = () => work(); client.release(); }',
    'function run() { const socket = net.connect(80); socket.write(data); socket.end(); }',
    'async function run(dataSource) { await dataSource.transaction(async (manager) => { await manager.save(row); }); }',
    'async function run(pool) { const client = pool.connect(); await work(); client.release(); }',
    'async function run(lock) { const handle = await lock.lock(); handle.unlock(); }',
    'async function run(other) { const client = await other.helper(); await work(); client.release(); }',
    'async function run(pool) { const client = await pool.connect(); if (flag) { await client.query(sql); } else { client.end(); } }',
    'async function run(pool) { const client = await pool.connect(); await client.query(sql).catch(() => {}); client.release(); }',
  ],
  invalid: [
    invalid(
      'async function run(dataSource) { const runner = dataSource.createQueryRunner(); await runner.connect(); await runner.query(sql); await runner.release(); }',
      'runner',
      'release',
    ),
    invalid(
      'async function run(pool) { const client = await pool.connect(); await client.query(sql); client.release(); }',
      'client',
      'release',
    ),
    invalid(
      'async function run(pool) { const client = await pool.connect(); const rows = await work(); client.release(); return rows; }',
      'client',
      'release',
    ),
    invalid(
      'async function run(runner) { const connection = await getConnection(); if (!pending) { return; } connection.close(); }',
      'connection',
      'close',
    ),
    invalid(
      'async function run(mutex) { const lock = await mutex.acquire(); if (bad) { throw new Error("x"); } lock.release(); }',
      'lock',
      'release',
    ),
    invalid(
      'async function run(stream) { const reader = stream.getReader(); const chunk = await reader.read(); reader.releaseLock(); }',
      'reader',
      'releaseLock',
    ),
    invalid(
      'async function run() { const bundle = await rollup(options); await bundle.write(output); await bundle.close(); }',
      'bundle',
      'close',
    ),
    invalid(
      'async function run(client) { const session = client.startSession(); await session.withTransaction(work); await session.endSession(); }',
      'session',
      'endSession',
    ),
    invalid(
      'async function run(pool) { const client = await pool.connect(); try { await client.query(sql); } catch (error) { log(error); throw error; } client.release(); }',
      'client',
      'release',
    ),
    invalid(
      'async function run(pool) { const client = await pool.connect(); for (const row of rows) { client.query(row); } client.release(); }',
      'client',
      'release',
    ),
    invalid(
      'const run = async (pool) => { const client = await pool.connect() as Client; await work(); client?.release(); }',
      'client',
      'release',
    ),
  ],
});
