import type { ormProject } from '../projects/orm-project.mts';
import { batchCases } from './batch-cases.mts';

type Project = ReturnType<typeof ormProject>;

export const IOREDIS_HEAD = [
  "import Redis, { Cluster } from 'ioredis';",
  'declare const redis: Redis;',
  'declare const cluster: Cluster;',
  'declare const ids: string[];',
  'declare const nums: number[];',
  'declare const events: { workspaceId: string; owner: { slug: string } }[];',
  'declare const seen: Set<string>;',
  'declare const out: unknown[];',
  'declare function use(value: unknown): void;',
  '',
].join('\n');

export const NODE_REDIS_HEAD = [
  "import { createClient, createCluster } from 'redis';",
  'declare const client: ReturnType<typeof createClient>;',
  'declare const cluster: ReturnType<typeof createCluster>;',
  'declare const ids: string[];',
  'declare const out: unknown[];',
  '',
].join('\n');

export function redisCases(project: Project, head: string) {
  const cases = batchCases(project, 'batchMget');
  return {
    ...cases,
    pair(body: string, expected: string) {
      return cases.fixes(`${head}${body}`, `${head}${expected}`, { report: 'cacheQuery' });
    },
    clean(body: string) {
      return cases.clean(`${head}${body}`);
    },
    declines(body: string, report: readonly string[] = ['cacheQuery']) {
      return cases.declines(`${head}${body}`, report);
    },
  };
}
