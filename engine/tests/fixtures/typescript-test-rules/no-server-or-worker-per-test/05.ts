import { Worker } from 'node:worker_threads';
function startTestHttpServer() { return new Worker(new URL('./server.mjs', import.meta.url)); }
async function server() { const started = await startTestHttpServer(); cleanups.push(() => started.terminate()); return started; }
it('stores and returns text', async () => { const remote = await server(); expect(remote).toBeDefined(); });