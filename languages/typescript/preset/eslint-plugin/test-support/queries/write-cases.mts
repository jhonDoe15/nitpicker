import type { ormProject } from '../projects/orm-project.mts';
import { batchCases } from './batch-cases.mts';

type Project = ReturnType<typeof ormProject>;

export const WRITE_HEAD = [
  "import { Repository } from 'typeorm';",
  "import { User, Code, Member, Category, Note } from './entities';",
  'declare const repo: Repository<User>;',
  'declare const codes: Repository<Code>;',
  'declare const members: Repository<Member>;',
  'declare const categories: Repository<Category>;',
  'declare const notes: Repository<Note>;',
  'declare const ids: number[];',
  'declare const slugs: string[];',
  'declare const rows: { id: number; teamId: number; slug: string; owner: { id: number } }[];',
  'declare const workspaceId: string;',
  'declare const out: unknown[];',
  'declare function stamp(): string;',
  'declare function use(value: unknown): void;',
  '',
].join('\n');

export const WRITE_HEAD_WITH_IN = WRITE_HEAD.replace('{ Repository }', '{ Repository, In }');

export function writeCases(project: Project) {
  const cases = batchCases(project, 'batchWrite');
  return {
    ...cases,
    pair(body: string, expected: string) {
      return cases.fixes(`${WRITE_HEAD}${body}`, `${WRITE_HEAD_WITH_IN}${expected}`);
    },
    clean(body: string) {
      return cases.clean(`${WRITE_HEAD}${body}`);
    },
    declines(body: string, report: readonly string[] = ['query']) {
      return cases.declines(`${WRITE_HEAD}${body}`, report);
    },
  };
}
