import { typescriptRuleTester } from '../../../../test-support/rule-tester.mts';
import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import {
  IOREDIS_HEAD,
  NODE_REDIS_HEAD,
  redisCases,
} from '../../../../test-support/queries/redis-cases.mts';

const ioredis = redisCases(ormProject('ioredis-declines'), IOREDIS_HEAD);
const nodeRedis = redisCases(ormProject('node-redis-declines'), NODE_REDIS_HEAD);

ioredis.project.tester.run('ioredis gets that stay as they are', ioInLoop, {
  valid: [],
  invalid: [
    ioredis.declines(`export async function run() {
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    const value = await redis.get(id);
    out.push(value);
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const id of ids) {
    const { length } = id;
    use(length);
    const value = await redis.get(id.trim());
    out.push(value);
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const id of ids) {
    const value = await cluster.get(id);
    out.push(value);
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const id of ids) {
    const pipeline = redis.pipeline();
    pipeline.get(id);
    out.push(await pipeline.exec());
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const id of ids) {
    const k = \`user:\${id}\`;
    const value = await redis.get(k);
    out.push(value);
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const id of ids) {
    out.push(JSON.parse((await redis.get(id)) ?? 'null'));
  }
}
`),
    ioredis.declines(
      `export async function run() {
  for (const id of ids) {
    const value = await redis.get(id);
    await redis.set(id, 'x');
    out.push(value);
  }
}
`,
      ['cacheQuery', 'cacheQuery'],
    ),
    ioredis.declines(`export async function run() {
  for (const id of ids) {
    const value = await redis.get(id);
    if (value === null) {
      break;
    }
    out.push(value);
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const event of events) {
    if (!event.owner) {
      continue;
    }
    const value = await redis.get(event.owner.slug);
    out.push(value);
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const id of seen) {
    const value = await redis.get(id);
    out.push(value);
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const id of ids) {
    const value = await redis.get(String(nums.length));
    out.push(value, id);
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const id of ids) {
    const value = await redis.get(id.length > 3 ? id : \`short:\${id}\`.toUpperCase());
    out.push(value);
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const id of ids) {
    const value = await redis.get(id);
    ids.push(id + value);
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const event of events) {
    event.workspaceId += 'x';
    const value = await redis.get(event.workspaceId);
    out.push(value);
  }
}
`),
    ioredis.declines(`export async function run() {
  for (const event of events) {
    event.owner.slug = 'x';
    const value = await redis.get(event.owner.slug);
    out.push(value);
  }
}
`),
  ],
});

nodeRedis.project.tester.run('node-redis gets that stay as they are', ioInLoop, {
  valid: [],
  invalid: [
    nodeRedis.declines(`export async function run() {
  for (const id of ids) {
    const value = await cluster.get(id);
    out.push(value);
  }
}
`),
  ],
});

typescriptRuleTester().run('ioredis gets without type information', ioInLoop, {
  valid: [],
  invalid: [
    {
      code: `${IOREDIS_HEAD}export async function run() {
  for (const id of ids) {
    const value = await redis.get(id);
    out.push(value);
  }
}
`,
      errors: [{ messageId: 'cacheQuery' }],
    },
  ],
});
