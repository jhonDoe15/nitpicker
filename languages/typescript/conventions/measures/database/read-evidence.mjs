import { parseProgram, withParents } from '../parsing/estree-program.mjs';
import { isEstreeConsumed } from '../../../preset/eslint-plugin/rules/support/flow/estree-consumed.mjs';
import { readMentions } from '../../../preset/eslint-plugin/rules/queries/soft-delete/read-mentions.mjs';

const ALL_ORMS = ['drizzle', 'knex', 'kysely', 'mikro', 'prisma', 'sequelize', 'typeorm'];
const READ_HINT = /\b(?:find|select|from|createQueryBuilder|knex|query)/iu;
const MAX_READS_PER_TABLE = 40;

function consumedCalls(program) {
  return withParents(program).filter(
    (node) => node.type === 'CallExpression' && node.parent !== undefined && isEstreeConsumed(node),
  );
}

function tableReads(text, file) {
  const program = READ_HINT.test(text) ? parseProgram(text, file) : undefined;
  if (program === undefined || program.ast === undefined) {
    return [];
  }
  return consumedCalls(program)
    .map((call) => readMentions(call, ALL_ORMS, program.visitorKeys))
    .filter((read) => read !== undefined && !read.acknowledged)
    .flatMap((read) => read.tables);
}

function evidenceOf(entry, ordinal) {
  const mark = String(ordinal);
  return [
    `read:${entry.table}#${mark}`,
    ...[...entry.columns.values()].map((column) => `guard:${entry.table}:col:${column}#${mark}`),
    ...[...entry.helpers].map((helper) => `guard:${entry.table}:fn:${helper}#${mark}`),
  ];
}

export function readEvidence(text, file) {
  const ordinals = new Map();
  const evidence = [];
  for (const entry of tableReads(text, file)) {
    const ordinal = (ordinals.get(entry.table) ?? 0) + 1;
    ordinals.set(entry.table, ordinal);
    if (ordinal <= MAX_READS_PER_TABLE) {
      evidence.push(...evidenceOf(entry, ordinal));
    }
  }
  return evidence;
}
