import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { parseProgram, withParents, type ParsedProgram } from '../parsing/estree-program.mts';
import { isEstreeConsumed } from '../../../preset/eslint-plugin/rules/support/flow/consumed.mts';
import {
  readMentions,
  type TableEntry,
} from '../../../preset/eslint-plugin/rules/queries/soft-delete/read-mentions.mts';

const ALL_ORMS = ['drizzle', 'knex', 'kysely', 'mikro', 'prisma', 'sequelize', 'typeorm'];
const READ_HINT = /\b(?:find|select|from|createQueryBuilder|knex|query)/iu;
const MAX_READS_PER_TABLE = 40;

function consumedCalls(program: ParsedProgram): TSESTree.CallExpression[] {
  return withParents(program).filter(
    (node): node is TSESTree.CallExpression =>
      node.type === AST_NODE_TYPES.CallExpression && isEstreeConsumed(node),
  );
}

function tableReads(text: string, file: string): TableEntry[] {
  const program = READ_HINT.test(text) ? parseProgram(text, file) : undefined;
  if (program === undefined || program.ast === undefined) {
    return [];
  }
  return consumedCalls(program).flatMap((call) => {
    const read = readMentions(call, ALL_ORMS, program.visitorKeys);
    return read === undefined || read.acknowledged ? [] : read.tables;
  });
}

function evidenceOf(entry: TableEntry, ordinal: number): string[] {
  const mark = String(ordinal);
  const table = String(entry.table);
  return [
    `read:${table}#${mark}`,
    ...[...entry.columns.values()].map((column) => `guard:${table}:col:${column}#${mark}`),
    ...[...entry.helpers].map((helper) => `guard:${table}:fn:${helper}#${mark}`),
  ];
}

export function readEvidence(text: string, file: string): string[] {
  const ordinals = new Map<string | undefined, number>();
  const evidence: string[] = [];
  for (const entry of tableReads(text, file)) {
    const ordinal = (ordinals.get(entry.table) ?? 0) + 1;
    ordinals.set(entry.table, ordinal);
    if (ordinal <= MAX_READS_PER_TABLE) {
      evidence.push(...evidenceOf(entry, ordinal));
    }
  }
  return evidence;
}
