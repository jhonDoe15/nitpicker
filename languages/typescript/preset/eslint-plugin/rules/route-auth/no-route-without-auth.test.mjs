import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-route-without-auth.mjs';

const common = "import { Controller, Get, Post } from '@nestjs/common';\n";
const SHAPE = ['nest__Authenticated__permission'];
const FALLBACK = ['nest__fallback'];
const MIDDLEWARE = ['route__requireAuth'];

function valid(code, entries) {
  return { code, options: [{ entries }] };
}

function invalid(code, entries, messageId) {
  return { code, options: [{ entries }], errors: [{ messageId }] };
}

const controller = (body, head = '') =>
  `${common}${head}@Controller('orders')\nclass OrdersController { ${body} }`;

typescriptRuleTester().run('no-route-without-auth nest majority', rule, {
  valid: [
    valid(controller('@Get() @Authenticated({ permission: Permission.Read }) list() {}'), SHAPE),
    valid(controller('@Get() @Authenticated({ permission: false }) health() {}'), SHAPE),
    valid(controller('@Get() @Public() health() {}'), SHAPE),
    valid(
      `${common}@Authenticated({ permission: Permission.Read })\n@Controller('orders')\nclass OrdersController { @Get() list() {} }`,
      SHAPE,
    ),
    valid(controller('@Get() list() {}'), []),
    valid('class Plain { @Get() list() {} }', SHAPE),
    valid(controller('helper() {}'), SHAPE),
  ],
  invalid: [
    invalid(controller('@Get() list() {}'), SHAPE, 'missingShape'),
    invalid(controller('@Post() @Authenticated() create() {}'), SHAPE, 'missingShape'),
    invalid(controller('@Post() @UseGuards(JwtGuard) create() {}'), SHAPE, 'missingShape'),
  ],
});

typescriptRuleTester().run('no-route-without-auth nest fallback', rule, {
  valid: [
    valid(controller('@Get() @UseGuards(JwtGuard) list() {}'), FALLBACK),
    valid(
      `${common}@UseGuards(JwtGuard)\n@Controller('orders')\nclass OrdersController { @Get() list() {} }`,
      FALLBACK,
    ),
    valid(controller('@Get() @Public() health() {}'), FALLBACK),
    valid(controller('@Get() @Roles("admin") list() {}'), FALLBACK),
    valid(controller('@Get() @ApiOperation({}) list() {}'), []),
  ],
  invalid: [
    invalid(controller('@Get() list() {}'), FALLBACK, 'missingGuard'),
    invalid(controller('@Get() @UseGuards(ThrottlerGuard) list() {}'), FALLBACK, 'missingGuard'),
    invalid(controller('@Get() @ApiBearerAuth() list() {}'), FALLBACK, 'missingGuard'),
    invalid(controller('@Get() @ApiOperation({}) list() {}'), FALLBACK, 'missingGuard'),
  ],
});

const express = "import express from 'express';\nconst app = express();\n";

typescriptRuleTester().run('no-route-without-auth express and fastify', rule, {
  valid: [
    valid(`${express}app.get('/orders', requireAuth, (req, res) => {});`, MIDDLEWARE),
    valid(`${express}app.use(requireAuth);\napp.get('/orders', (req, res) => {});`, MIDDLEWARE),
    valid(
      `${express}app.use('/api', requireAuth);\napp.post('/api/orders', (req, res) => {});`,
      MIDDLEWARE,
    ),
    valid(`${express}app.get('/orders', [limiter, requireAuth], (req, res) => {});`, MIDDLEWARE),
    valid(
      "import Fastify from 'fastify';\nconst app = Fastify();\napp.get('/orders', { preHandler: requireAuth }, async () => {});",
      MIDDLEWARE,
    ),
    valid(
      "import Fastify from 'fastify';\nconst app = Fastify();\napp.addHook('onRequest', requireAuth);\napp.get('/orders', async () => {});",
      MIDDLEWARE,
    ),
    valid("const cache = new Map();\ncache.get('/orders');", MIDDLEWARE),
    valid("import express from 'express';\nconst m = new Map();\nm.get('key');", MIDDLEWARE),
    valid(`${express}app.get('/orders', (req, res) => {});`, []),
    valid(`${express}app.get('/health', (req, res) => {});`, MIDDLEWARE),
    valid(`${express}app.post('/login', express.json(), (req, res) => {});`, MIDDLEWARE),
    valid(`${express}app.post('/webhooks/stripe', express.raw(), (req, res) => {});`, MIDDLEWARE),
    valid(`${express}const snap = await docRef.get();`, MIDDLEWARE),
    valid(`${express}await axios.get('/api/x', { params });`, MIDDLEWARE),
    valid(`${express}api.post('/internal/sync', payload);`, MIDDLEWARE),
    valid(
      `${express}const router = express.Router();\nrouter.use(requireAuth);\nif (enabled) { router.get('/a', (req, res) => {}); }`,
      MIDDLEWARE,
    ),
    valid(
      `${express}function mount(app: Express) { app.get('/orders', requireAuth, (req, res) => {}); }`,
      MIDDLEWARE,
    ),
  ],
  invalid: [
    invalid(`${express}app.get('/admin', (req, res) => {});`, MIDDLEWARE, 'missingMiddleware'),
    invalid(
      `${express}app.get('/orders', limiter, (req, res) => {});`,
      MIDDLEWARE,
      'missingMiddleware',
    ),
    invalid(
      `${express}const router = express.Router();\nrouter.post('/orders', handler);`,
      MIDDLEWARE,
      'missingMiddleware',
    ),
    invalid(
      "import Fastify from 'fastify';\nconst app = Fastify();\napp.get('/orders', async () => {});",
      MIDDLEWARE,
      'missingMiddleware',
    ),
    invalid(
      `${express}function mount(app: Express) { app.get('/orders', (req, res) => {}); }`,
      MIDDLEWARE,
      'missingMiddleware',
    ),
    invalid(
      "import Fastify from 'fastify';\nconst app = Fastify();\napp.register(async (instance) => { instance.get('/orders', async () => {}); });",
      MIDDLEWARE,
      'missingMiddleware',
    ),
  ],
});
