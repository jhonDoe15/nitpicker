import { ormProject } from '../projects/orm-project.mts';

type Project = ReturnType<typeof ormProject>;
export type SuggestionId = 'batchLookup' | 'batchGroups' | 'batchMget' | 'batchWrite';

export type BatchCases = {
  readonly project: Project;
  readonly fixes: (
    code: string,
    output: string,
    ids?: { readonly report?: string; readonly suggestion?: SuggestionId },
  ) => ReturnType<Project['typed']> & { errors: object[] };
  readonly declines: (
    code: string,
    report?: readonly string[],
  ) => ReturnType<Project['typed']> & { errors: object[] };
  readonly clean: (code: string) => ReturnType<Project['typed']>;
};

export function batchCases(project: Project, defaultSuggestion: SuggestionId): BatchCases {
  return {
    project,
    fixes(code, output, ids = {}) {
      const suggestion = { messageId: ids.suggestion ?? defaultSuggestion, output };
      return {
        ...project.typed(code),
        errors: [{ messageId: ids.report ?? 'query', suggestions: [suggestion] }],
      };
    },
    declines(code, report = ['query']) {
      return { ...project.typed(code), errors: report.map((messageId) => ({ messageId })) };
    },
    clean: (code) => project.typed(code),
  };
}

export const TYPEORM_HEAD = [
  "import { Repository } from 'typeorm';",
  "import { User, Code } from './entities';",
  'declare const repo: Repository<User>;',
  'declare const codes: Repository<Code>;',
  'declare const ids: number[];',
  'declare const emails: string[];',
  'declare const slugs: string[];',
  'declare const events: { workspaceId: string; teamId: number; owner: { id: number } }[];',
  'declare const workspaceId: string;',
  'declare const skip: Set<number>;',
  'declare const out: unknown[];',
  'declare function use(value: unknown): void;',
  '',
].join('\n');

export const TYPEORM_HEAD_WITH_IN = TYPEORM_HEAD.replace('{ Repository }', '{ Repository, In }');

export function typeormCases(project: Project, suggestion: SuggestionId = 'batchLookup') {
  const cases = batchCases(project, suggestion);
  return {
    ...cases,
    pair(body: string, expected: string, ids?: { readonly report?: string }) {
      return cases.fixes(`${TYPEORM_HEAD}${body}`, `${TYPEORM_HEAD_WITH_IN}${expected}`, ids);
    },
    declines(body: string, report?: readonly string[]) {
      return cases.declines(`${TYPEORM_HEAD}${body}`, report);
    },
  };
}

export const PRISMA_HEAD = [
  "import { PrismaClient } from '@prisma/client';",
  'declare const prisma: PrismaClient;',
  'declare const ids: number[];',
  'declare const emails: string[];',
  'declare const teamIds: string[];',
  'declare const events: { ownerId: number; teamId: string }[];',
  'declare const scope: number;',
  'declare const out: unknown[];',
  'declare function use(value: unknown): void;',
  '',
].join('\n');

export function prismaCases(project: Project, suggestion: SuggestionId = 'batchLookup') {
  const cases = batchCases(project, suggestion);
  return {
    ...cases,
    pair(body: string, expected: string, ids?: { readonly report?: string }) {
      return cases.fixes(`${PRISMA_HEAD}${body}`, `${PRISMA_HEAD}${expected}`, ids);
    },
    declines(body: string, report?: readonly string[]) {
      return cases.declines(`${PRISMA_HEAD}${body}`, report);
    },
  };
}
