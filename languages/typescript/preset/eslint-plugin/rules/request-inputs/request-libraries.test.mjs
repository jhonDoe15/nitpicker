import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-uncoerced-request-input.mjs';
import { expectedError } from './test-support/expected-error.mjs';

const tester = typescriptRuleTester();
const ZOD = "import { z } from 'zod';\n";
const VALIBOT = "import * as v from 'valibot';\n";
const HONO = "import { zValidator } from '@hono/zod-validator';\n";

function invalid(code, errors, filename) {
  return {
    code,
    ...(filename === undefined ? {} : { filename }),
    errors: errors.map(([messageId, data]) => expectedError(messageId, data)),
  };
}

tester.run('no-uncoerced-request-input on request schemas', rule, {
  valid: [
    `${ZOD}const Query = z.object({ limit: z.coerce.number() });\nexport function list(req) { return Query.parse(req.query); }`,
    `${ZOD}const Body = z.object({ limit: z.number() });\nexport function create(req) { return Body.parse(req.body); }`,
    `${ZOD}const Query = z.object({ limit: z.number() });\nexport function load(input) { return Query.parse(input.query); }`,
    `${ZOD}export function list(req) { return z.object({ id: z.string().uuid(), at: z.preprocess((value) => new Date(String(value)), z.date()) }).parse(req.params); }`,
    `${ZOD}const Query = z.object({ limit: z.union([z.number(), z.string()]) });\nexport function list(req) { return Query.parse(req.query); }`,
    `${VALIBOT}const Query = v.object({ limit: v.pipe(v.string(), v.toNumber(), v.number()) });\nexport function list(req) { return v.parse(Query, req.query); }`,
    `${HONO}${ZOD}export const route = zValidator('json', z.object({ limit: z.number() }));`,
    `${ZOD}export const route = { schema: { body: z.object({ limit: z.number() }) } };`,
    `export const route = { schema: { querystring: { type: 'object', properties: { limit: { type: 'integer' } } } } };`,
    `import { parse } from './schemas';\nexport function list(req) { return parse(req.query); }`,
  ],
  invalid: [
    invalid(
      `${ZOD}const Query = z.object({ limit: z.number().int().min(1).default(20), name: z.string() });\nexport function list(req) { return Query.parse(req.query); }`,
      [['rejected', { field: 'limit', source: 'query string', form: 'z.number()' }]],
    ),
    invalid(
      `${ZOD}const Limit = z.number();\nconst Query = z.object({ limit: Limit, all: z.boolean().optional() });\nexport async function list(request) { return Query.safeParseAsync(request.query); }`,
      [
        ['rejected', { field: 'limit' }],
        [
          'rejected',
          {
            field: 'all',
            fix: "z.stringbool() or z.enum(['true', 'false']).transform((value) => value === 'true')",
          },
        ],
      ],
    ),
    invalid(
      `${ZOD}export function get(req) { return z.object({ id: z.bigint() }).parse(req.params); }`,
      [['rejected', { field: 'id', source: 'path', fix: 'z.coerce.bigint()' }]],
    ),
    invalid(
      `${ZOD}const Headers = z.object({ retry: z.object({ count: z.int32() }) });\nexport function get(ctx) { return Headers.parse(ctx.request.headers); }`,
      [['rejected', { field: 'retry.count', source: 'headers' }]],
    ),
    invalid(
      `${VALIBOT}const Query = v.object({ limit: v.optional(v.pipe(v.number(), v.integer())), all: v.boolean() });\nexport function list(req) { return v.parse(Query, req.query); }`,
      [
        [
          'rejected',
          {
            field: 'limit',
            form: 'v.number()',
            fix: 'v.pipe(v.string(), v.toNumber(), v.number())',
          },
        ],
        ['rejected', { field: 'all' }],
      ],
    ),
    invalid(
      `${HONO}${ZOD}export const route = zValidator('query', z.object({ page: z.number(), all: z.coerce.boolean() }));`,
      [
        ['rejected', { field: 'page' }],
        ['booleanCast', { field: 'all', form: 'z.coerce.boolean()' }],
      ],
    ),
    invalid(
      `${HONO}${ZOD}export const route = zValidator('form', z.object({ size: z.number() }));`,
      [['rejected', { field: 'size', source: 'multipart form' }]],
    ),
    invalid(
      `${ZOD}export function list(c) { return z.object({ page: z.number() }).parse(c.req.query()); }`,
      [['rejected', { field: 'page' }]],
    ),
    invalid(
      `${ZOD}const Query = z.object({ page: z.number() });\nexport const route = { schema: { querystring: Query, params: z.object({ id: z.number() }) } };`,
      [
        ['rejected', { field: 'page', source: 'query string' }],
        ['rejected', { field: 'id', source: 'path' }],
      ],
    ),
    invalid(
      "const { z } = require('zod');\nconst Query = z.object({ page: z.number() });\nexports.list = (req) => Query.parse(req.query);",
      [['rejected', { field: 'page' }]],
      'routes.js',
    ),
  ],
});
