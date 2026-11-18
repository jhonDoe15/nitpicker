import { ormProject } from '../projects/orm-project.mts';

type Project = ReturnType<typeof ormProject>;
type SuggestionId = 'batchLookup' | 'batchGroups';

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

export function typeormCases(project: Project) {
  const cases = batchCases(project, 'batchLookup');
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
