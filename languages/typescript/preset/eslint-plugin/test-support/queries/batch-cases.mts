import type { ormProject } from '../projects/orm-project.mts';

const QUERY = 'query';

export type Project = ReturnType<typeof ormProject>;
export type SuggestionId =
  'batchLookup' | 'batchGroups' | 'batchMget' | 'batchWrite' | 'batchInsert';

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
        errors: [{ messageId: ids.report ?? QUERY, suggestions: [suggestion] }],
      };
    },
    declines(code, report = [QUERY]) {
      return { ...project.typed(code), errors: report.map((messageId) => ({ messageId })) };
    },
    clean: (code) => project.typed(code),
  };
}

const TYPEORM_HEAD = [
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

type Heads = { readonly before: string; readonly after: string };
type HeadedOptions = Heads & { readonly suggestion: SuggestionId; readonly report?: string };
type Ids = { readonly report?: string };

export type HeadedCases = {
  readonly project: Project;
  readonly fixes: BatchCases['fixes'];
  readonly pair: (body: string, expected: string, ids?: Ids) => ReturnType<BatchCases['fixes']>;
  readonly declines: (
    body: string,
    report?: readonly string[],
  ) => ReturnType<BatchCases['declines']>;
  readonly clean: (body: string) => ReturnType<Project['typed']>;
};

export function headedCases(project: Project, options: HeadedOptions): HeadedCases {
  const { before, after, suggestion, report = QUERY } = options;
  const cases = batchCases(project, suggestion);
  return {
    project,
    fixes: cases.fixes,
    pair: (body, expected, ids) =>
      cases.fixes(`${before}${body}`, `${after}${expected}`, { report, ...ids }),
    declines: (body, reports = [report]) => cases.declines(`${before}${body}`, reports),
    clean: (body) => cases.clean(`${before}${body}`),
  };
}

export function typeormCases(
  project: Project,
  suggestion: SuggestionId = 'batchLookup',
): HeadedCases {
  const headed = headedCases(project, {
    before: TYPEORM_HEAD,
    after: TYPEORM_HEAD_WITH_IN,
    suggestion,
  });
  return { ...headed, clean: batchCases(project, suggestion).clean };
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

export function prismaCases(
  project: Project,
  suggestion: SuggestionId = 'batchLookup',
): HeadedCases {
  const headed = headedCases(project, { before: PRISMA_HEAD, after: PRISMA_HEAD, suggestion });
  return { ...headed, clean: batchCases(project, suggestion).clean };
}
