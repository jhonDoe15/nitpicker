import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import {
  IOREDIS_HEAD,
  NODE_REDIS_HEAD,
  redisCases,
} from '../../../../test-support/queries/redis-cases.mts';

const ioredis = redisCases(ormProject('ioredis-mget'), IOREDIS_HEAD);
const nodeRedis = redisCases(ormProject('node-redis-mget'), NODE_REDIS_HEAD);

ioredis.project.tester.run('ioredis get in a loop', ioInLoop, {
  valid: [
    ioredis.clean(`export async function run() {
  const valueByKey = new Map<string, string | null>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    const values = await redis.mget(part);
    for (const [offset, key] of part.entries()) {
      valueByKey.set(key, values[offset] ?? null);
    }
  }
}
`),
  ],
  invalid: [
    ioredis.pair(
      `export async function run() {
  for (const id of ids) {
    const value = await redis.get(id);
    out.push(value);
  }
}
`,
      `export async function run() {
  const valueByKey = new Map<string, string | null>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    const values = await redis.mget(part);
    for (const [offset, key] of part.entries()) {
      valueByKey.set(key, values[offset] ?? null);
    }
  }
  for (const id of ids) {
    const value = valueByKey.get(id) ?? null;
    out.push(value);
  }
}
`,
    ),
    ioredis.pair(
      `export async function run() {
  for (const id of ids) {
    const raw = await redis.get(\`user:\${id}\`);
    if (raw) {
      use(JSON.parse(raw));
    }
  }
}
`,
      `export async function run() {
  const keys = ids.map((id) => \`user:\${id}\`);
  const rawByKey = new Map<string, string | null>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    const values = await redis.mget(part);
    for (const [offset, key] of part.entries()) {
      rawByKey.set(key, values[offset] ?? null);
    }
  }
  for (const id of ids) {
    const raw = rawByKey.get(\`user:\${id}\`) ?? null;
    if (raw) {
      use(JSON.parse(raw));
    }
  }
}
`,
    ),
    ioredis.pair(
      `export async function run() {
  for (const event of events) {
    const state = await redis.get(\`ws:\${event.workspaceId}:\${event.owner.slug}\`);
    out.push(state ?? 'none');
  }
}
`,
      `export async function run() {
  const keys = events.map((event) => \`ws:\${event.workspaceId}:\${event.owner.slug}\`);
  const stateByKey = new Map<string, string | null>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    const values = await redis.mget(part);
    for (const [offset, key] of part.entries()) {
      stateByKey.set(key, values[offset] ?? null);
    }
  }
  for (const event of events) {
    const state = stateByKey.get(\`ws:\${event.workspaceId}:\${event.owner.slug}\`) ?? null;
    out.push(state ?? 'none');
  }
}
`,
    ),
    ioredis.pair(
      `export async function run() {
  const values = await Promise.all(
    ids.map(async (id) => {
      const value = await redis.get(id);
      return value;
    }),
  );
  use(values);
}
`,
      `export async function run() {
  const valueByKey = new Map<string, string | null>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    const values2 = await redis.mget(part);
    for (const [offset, key] of part.entries()) {
      valueByKey.set(key, values2[offset] ?? null);
    }
  }
  const values = await Promise.all(
    ids.map(async (id) => {
      const value = valueByKey.get(id) ?? null;
      return value;
    }),
  );
  use(values);
}
`,
    ),
    ioredis.pair(
      `export class Cache {
  private readonly redis!: Redis;
  async run() {
    for (const id of ids) {
      const value = await this.redis.get(id);
      out.push(value);
    }
  }
}
`,
      `export class Cache {
  private readonly redis!: Redis;
  async run() {
    const valueByKey = new Map<string, string | null>();
    for (let index = 0; index < ids.length; index += 500) {
      const part = ids.slice(index, index + 500);
      const values = await this.redis.mget(part);
      for (const [offset, key] of part.entries()) {
        valueByKey.set(key, values[offset] ?? null);
      }
    }
    for (const id of ids) {
      const value = valueByKey.get(id) ?? null;
      out.push(value);
    }
  }
}
`,
    ),
    ioredis.pair(
      `export async function run() {
  const keys = ['a'];
  for (const id of ids) {
    const value = await redis.get(id);
    out.push(value, keys);
  }
}
`,
      `export async function run() {
  const keys = ['a'];
  const valueByKey = new Map<string, string | null>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    const values = await redis.mget(part);
    for (const [offset, key] of part.entries()) {
      valueByKey.set(key, values[offset] ?? null);
    }
  }
  for (const id of ids) {
    const value = valueByKey.get(id) ?? null;
    out.push(value, keys);
  }
}
`,
    ),
    ioredis.pair(
      `export async function run() {
  for (const id of ids) {
    const value = await redis.get(id);
    const parsed = value === null ? null : JSON.parse(value);
    out.push(parsed);
  }
}
`,
      `export async function run() {
  const valueByKey = new Map<string, string | null>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    const values = await redis.mget(part);
    for (const [offset, key] of part.entries()) {
      valueByKey.set(key, values[offset] ?? null);
    }
  }
  for (const id of ids) {
    const value = valueByKey.get(id) ?? null;
    const parsed = value === null ? null : JSON.parse(value);
    out.push(parsed);
  }
}
`,
    ),
    ioredis.pair(
      `export async function run() {
  for (const id of ids) {
    use(id);
    const value = await redis.get(\`k:\${id}\`);
    out.push(value);
  }
}
`,
      `export async function run() {
  const keys = ids.map((id) => \`k:\${id}\`);
  const valueByKey = new Map<string, string | null>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    const values = await redis.mget(part);
    for (const [offset, key] of part.entries()) {
      valueByKey.set(key, values[offset] ?? null);
    }
  }
  for (const id of ids) {
    use(id);
    const value = valueByKey.get(\`k:\${id}\`) ?? null;
    out.push(value);
  }
}
`,
    ),
    ioredis.pair(
      `export async function run() {
  for (const id of ids) {
    const value = await redis.get(id);
    // keep
    out.push(value);
  }
}
`,
      `export async function run() {
  const valueByKey = new Map<string, string | null>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    const values = await redis.mget(part);
    for (const [offset, key] of part.entries()) {
      valueByKey.set(key, values[offset] ?? null);
    }
  }
  for (const id of ids) {
    const value = valueByKey.get(id) ?? null;
    // keep
    out.push(value);
  }
}
`,
    ),
    ioredis.pair(
      `export async function run() {
  for (const id of ids) {
    const value = await redis.get(redis.get.name + id);
    out.push(value);
  }
}
`,
      `export async function run() {
  const keys = ids.map((id) => redis.get.name + id);
  const valueByKey = new Map<string, string | null>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    const values = await redis.mget(part);
    for (const [offset, key] of part.entries()) {
      valueByKey.set(key, values[offset] ?? null);
    }
  }
  for (const id of ids) {
    const value = valueByKey.get(redis.get.name + id) ?? null;
    out.push(value);
  }
}
`,
    ),
  ],
});

nodeRedis.project.tester.run('node-redis get in a loop', ioInLoop, {
  valid: [],
  invalid: [
    nodeRedis.pair(
      `export async function run() {
  for (const id of ids) {
    const value = await client.get(id);
    out.push(value);
  }
}
`,
      `export async function run() {
  const valueByKey = new Map<string, string | null>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    const values = await client.mGet(part);
    for (const [offset, key] of part.entries()) {
      valueByKey.set(key, values[offset] ?? null);
    }
  }
  for (const id of ids) {
    const value = valueByKey.get(id) ?? null;
    out.push(value);
  }
}
`,
    ),
    nodeRedis.pair(
      `export async function run() {
  for (const id of ids) {
    const value = await client.get(\`session:\${id}\`);
    if (value === null) {
      continue;
    }
    out.push(value);
  }
}
`,
      `export async function run() {
  const keys = ids.map((id) => \`session:\${id}\`);
  const valueByKey = new Map<string, string | null>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    const values = await client.mGet(part);
    for (const [offset, key] of part.entries()) {
      valueByKey.set(key, values[offset] ?? null);
    }
  }
  for (const id of ids) {
    const value = valueByKey.get(\`session:\${id}\`) ?? null;
    if (value === null) {
      continue;
    }
    out.push(value);
  }
}
`,
    ),
  ],
});
