import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-listen-on-all-interfaces.mts';

const tester = typescriptRuleTester();
const filename = '/repo/src/auth/login.ts';
const plain = '/repo/src/server.ts';
const HTTP = "import http from 'node:http';\n";
const error = [{ messageId: 'allInterfaces' as const }];

tester.run('no-listen-on-all-interfaces', rule, {
  valid: [
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen(port, 'localhost', () => open(url));`,
    },
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen({ port, host: '127.0.0.1' });`,
    },
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen(port, '0.0.0.0');`,
    },
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen(port, host, cb);`,
    },
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen(port, host);`,
    },
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen('/tmp/app.sock');`,
    },
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen({ path: '/tmp/app.sock' });`,
    },
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen({ ...options });`,
    },
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen();`,
    },
    { filename: plain, code: `${HTTP}const server = http.createServer(h); server.listen(3000);` },
    {
      filename: plain,
      code: "import express from 'express';\nfunction main() { const app = express(); app.get('/login', h); app.listen(3000); }",
    },
    {
      filename: plain,
      code: `${HTTP}const server = http.createServer(); server.listen(0, () => server.close());`,
    },
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen(0);`,
    },
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen(options);`,
    },
    {
      filename: '/repo/src/bin/tool.ts',
      code: `${HTTP}const server = http.createServer(h); server.listen(port, () => log());`,
    },
    {
      filename: plain,
      code: `${HTTP}function start(port) { const server = http.createServer(h); server.listen(port, () => log()); }`,
    },
    { filename, code: 'const callbackServer = makeServer(); callbackServer.listen(port);' },
    { filename, code: `${HTTP}const queue = buildQueue(); queue.listen(port);` },
    {
      filename,
      code: "import http from 'node:http';\nconst server = other.createServer(h);\nserver.listen(port);",
    },
  ],
  invalid: [
    {
      filename,
      code: `${HTTP}const callbackServer = http.createServer(h); callbackServer.listen(port, () => openBrowser(authUrl));`,
    },
    {
      filename,
      code: `${HTTP}function waitForCode(port) { const s = http.createServer(h); s.listen(port); }`,
    },
    {
      filename: plain,
      code: `${HTTP}function startSsoServer(port) { const s = http.createServer(h); s.listen({ port }); }`,
    },
    { filename, code: `${HTTP}http.createServer(h).listen(port);` },
    {
      filename: plain,
      code: `${HTTP}const server = http.createServer((req, res) => handleOauthCallback(req, res)); server.listen(port);`,
    },
    {
      filename: plain,
      code: `${HTTP}const server = http.createServer(h); server.listen(port, () => open(redirectUrl));`,
    },
    {
      filename,
      code: "const http = require('http');\nconst server = http.createServer(h);\nserver.listen(8080);",
    },
    {
      filename: '/repo/src/cli/tool.ts',
      code: `${HTTP}const server = http.createServer(h); server.listen(port, () => log());`,
    },
    {
      filename: plain,
      code: `import { app } from 'electron';\n${HTTP}const server = http.createServer(h); server.listen(5000);`,
    },
    { filename, code: "import Koa from 'koa';\nconst app = new Koa();\napp.listen(port);" },
  ].map((entry) => ({ ...entry, errors: error })),
});
