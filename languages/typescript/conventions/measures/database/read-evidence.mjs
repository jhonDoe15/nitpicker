import tseslint from 'typescript-eslint';
import { isEstreeConsumed } from '../../../preset/eslint-plugin/rules/support/flow/consumed.mjs';
import { readMentions } from '../../../preset/eslint-plugin/rules/queries/soft-delete/read-mentions.mjs';
import { childrenOf } from '../../../preset/eslint-plugin/rules/loops/loop-shapes.mjs';

const ALL_ORMS = ['drizzle', 'knex', 'kysely', 'mikro', 'prisma', 'sequelize', 'typeorm'];
const READ_HINT = /\b(?:find|select|from|createQueryBuilder|knex|query)/iu;
const MAX_READS_PER_TABLE = 40;

export function parsedProgram(text, file) {
  if (!READ_HINT.test(text)) {
    return undefined;
  }
  try {
    const { ast, visitorKeys } = tseslint.parser.parseForESLint(text, {
      sourceType: 'module',
      range: true,
      filePath: file,
    });
    return { ast, visitorKeys };
  } catch {
    return undefined;
  }
}

function consumedCalls({ ast, visitorKeys }) {
  const calls = [];
  const pending = [ast];
  for (const node of pending) {
    const children = childrenOf(node, visitorKeys);
    for (const child of children) {
      child.parent = node;
    }
    if (node.type === 'CallExpression' && node.parent !== undefined && isEstreeConsumed(node)) {
      calls.push(node);
    }
    pending.push(...children);
  }
  return calls;
}

export function tableReads(text, file) {
  const program = parsedProgram(text, file);
  if (program === undefined) {
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
