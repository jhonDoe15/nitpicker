import { headedCases, type HeadedCases, type Project } from './batch-cases.mts';

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

export function redisCases(project: Project, head: string): HeadedCases {
  return headedCases(project, {
    before: head,
    after: head,
    suggestion: 'batchMget',
    report: 'cacheQuery',
  });
}
