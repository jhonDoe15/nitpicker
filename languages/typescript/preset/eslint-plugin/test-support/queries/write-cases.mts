import { headedCases, type HeadedCases, type Project } from './batch-cases.mts';

const IDS_DECLARATION = 'declare const ids: number[];';
const OUT_DECLARATION = 'declare const out: unknown[];';

export const WRITE_HEAD = [
  "import { Repository } from 'typeorm';",
  "import { User, Code, Member, Category, Note } from './entities';",
  'declare const repo: Repository<User>;',
  'declare const codes: Repository<Code>;',
  'declare const members: Repository<Member>;',
  'declare const categories: Repository<Category>;',
  'declare const notes: Repository<Note>;',
  IDS_DECLARATION,
  'declare const slugs: string[];',
  'declare const rows: { id: number; teamId: number; slug: string; owner: { id: number } }[];',
  'declare const workspaceId: string;',
  OUT_DECLARATION,
  'declare function stamp(): string;',
  'declare function use(value: unknown): void;',
  '',
].join('\n');

const WRITE_HEAD_WITH_IN = WRITE_HEAD.replace('{ Repository }', '{ Repository, In }');

export function writeCases(project: Project): HeadedCases {
  return headedCases(project, {
    before: WRITE_HEAD,
    after: WRITE_HEAD_WITH_IN,
    suggestion: 'batchWrite',
  });
}

export const INSERT_HEAD = [
  "import { Repository } from 'typeorm';",
  "import { User, Code, Note } from './entities';",
  'declare const repo: Repository<User>;',
  'declare const codes: Repository<Code>;',
  'declare const notes: Repository<Note>;',
  IDS_DECLARATION,
  'declare const rows: { name: string; slug: string; teamId: number; owner: { id: number } }[];',
  'declare const noteRows: { email: string; ownerId: number }[];',
  'declare const entities: { name: string }[];',
  'declare const workspaceId: string;',
  OUT_DECLARATION,
  'declare function toEntity(row: { name: string }): User;',
  'declare function stamp(): string;',
  'declare function use(value: unknown): void;',
  '',
].join('\n');

export const PRISMA_INSERT_HEAD = [
  "import { PrismaClient } from '@prisma/client';",
  'declare const prisma: PrismaClient;',
  IDS_DECLARATION,
  'declare const rows: { name: string; ownerId: number; team: string }[];',
  'declare const scope: number;',
  'declare const clock: { now(): number };',
  OUT_DECLARATION,
  'declare function toData(row: { name: string }): { name: string; userId: number };',
  '',
].join('\n');

export function insertCases(project: Project, head: string): HeadedCases {
  return headedCases(project, { before: head, after: head, suggestion: 'batchInsert' });
}
