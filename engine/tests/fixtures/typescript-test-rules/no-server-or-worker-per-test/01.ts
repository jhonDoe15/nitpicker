import { createServer } from 'node:http';
const server = createServer(handler);
beforeAll(() => new Promise((resolve) => server.listen(0, resolve)));
beforeEach(() => { store.clear(); });
it('reads', async () => { expect(await fetch(url)).toBeDefined(); });