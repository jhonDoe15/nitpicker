import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-fixed-port-in-tests.mts';

const tester = typescriptRuleTester();

const inTest = (body: string) => `it("serves", async () => { ${body} });`;
const flagged = (code: string) => ({ code, errors: [{ messageId: 'fixedPort' as const }] });

tester.run('no-fixed-port-in-tests', rule, {
  valid: [
    inTest('const server = app.listen(0);'),
    inTest('const server = app.listen();'),
    inTest('server.listen({ port: 0, host: "127.0.0.1" });'),
    inTest('server.listen(port);'),
    inTest('server.listen(process.env.PORT);'),
    inTest('server.listen(await getPort());'),
    inTest('server.listen("/tmp/app.sock");'),
    inTest('const wss = new WebSocketServer({ port: 0 });'),
    inTest('const wss = new WebSocketServer({ server });'),
    inTest('const client = new Client({ port: 5432 });'),
    inTest('await page.goto("http://localhost:3000");'),
    inTest('const url = new URL("http://localhost:3000"); connect({ port: 3000 });'),
    'const server = app.listen(3000);',
    'export function start() { return app.listen(3000); }',
    'beforeAll(() => { helper.start(3000); });',
    'function serve() { http.createServer(handler).listen(4000); }',
    inTest('await expect(app.listen(70000)).rejects.toThrow();'),
    inTest('await expect(app.listen(3000, "1")).rejects.toMatchObject({ code: "EADDRNOTAVAIL" });'),
    inTest('try { app.listen({ port: 1234, signal: {} }); assert.fail("should throw"); } catch {}'),
    'it("falls back when the port is in use", async () => { blocker.listen(4211); });',
    'it("rejects when the port is not available", async () => { await app.listen(3000); });',
    inTest(
      'const listen = spyOnListen(); adapter.listen(3000); expect(listen).toHaveBeenCalled();',
    ),
    inTest('vi.spyOn(server, "listen"); app.listen(3000);'),
    inTest(
      'try { app.listen({ port: 1234, signal: {} }); t.assert.fail("should throw"); } catch {}',
    ),
  ],
  invalid: [
    flagged(inTest('const server = app.listen(3000);')),
    flagged(inTest('server.listen(3000, "127.0.0.1", done);')),
    flagged(inTest('await fastify.listen({ port: 3000 });')),
    flagged(inTest('http.createServer(handler).listen(8080);')),
    flagged('const PORT = 4000; it("serves", () => { app.listen(PORT); });'),
    flagged('beforeAll(async () => { server = app.listen(3001); });'),
    flagged('describe("api", () => { beforeEach(() => { server.listen(3002); }); });'),
    flagged(inTest('const wss = new WebSocketServer({ port: 8081 });')),
    flagged(inTest('const wss = new WebSocket.Server({ port: 8081 });')),
    flagged('test.each([1, 2])("serves %i", () => { app.listen(9000); });'),
    {
      code: inTest('await app.listen(3000); await other.listen(3001);'),
      errors: [{ messageId: 'fixedPort' as const }, { messageId: 'fixedPort' as const }],
    },
    flagged(inTest('try { app.listen(3000); } finally { app.close(); }')),
    flagged(
      inTest('const listener = vi.fn(); server.on("listening", listener); server.listen(3000);'),
    ),
    flagged('it("serves taken slots", () => { server.listen(3000); });'),
    flagged('describe("busy hours", () => { it("serves", () => { server.listen(3000); }); });'),
    flagged(inTest('try { server.listen(3000); report.fail(); } catch {}')),
  ],
});
