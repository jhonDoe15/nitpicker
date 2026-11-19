import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { typescriptRuleTester } from '../../../../test-support/rule-tester.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import { batchCases } from '../../../../test-support/queries/batch-cases.mts';

const HEAD = [
  "import { Repository } from 'typeorm';",
  "import { BigThing, Token, Member, Note, Price, Coupon, Plain, User } from './entities';",
  'declare const ids: number[];',
  'declare const keys: string[];',
  'declare const out: unknown[];',
  '',
].join('\n');

function lookup(entity: string, where: string, source = 'keys') {
  return [
    `declare const repo: Repository<${entity}>;`,
    'export async function run() {',
    `  for (const key of ${source}) {`,
    `    const row = await repo.findOneBy({ ${where} });`,
    '    console.log(row);',
    '  }',
    '}',
    '',
  ].join('\n');
}

const main = batchCases(ormProject('typeorm-columns'), 'batchLookup');
const old = batchCases(ormProject('typeorm-old', { typeormVersion: '0.2.45' }), 'batchLookup');
const mysql = batchCases(ormProject('typeorm-mysql', { dependencies: ['mysql2'] }), 'batchLookup');
const mssql = batchCases(ormProject('typeorm-mssql', { dependencies: ['mssql'] }), 'batchLookup');
const postgres = batchCases(ormProject('typeorm-pg', { dependencies: ['pg'] }), 'batchLookup');

const COUPON_BEFORE = `${HEAD}${lookup('Coupon', 'code: key')}`;
const COUPON_AFTER = `${HEAD.replace('{ Repository }', '{ Repository, In }')}${[
  'declare const repo: Repository<Coupon>;',
  'export async function run() {',
  '  const rowsByCode = new Map<string, Coupon>();',
  '  for (let index = 0; index < keys.length; index += 500) {',
  '    const part = keys.slice(index, index + 500);',
  '    for (const row2 of await repo.findBy({ code: In(part) })) {',
  '      rowsByCode.set(row2.code, row2);',
  '    }',
  '  }',
  '  for (const key of keys) {',
  '    const row = rowsByCode.get(key) ?? null;',
  '    console.log(row);',
  '  }',
  '}',
  '',
].join('\n')}`;

main.project.tester.run('typeorm key columns', ioInLoop, {
  valid: [
    main.clean(
      `${HEAD}class Wrapper {\n  findOneBy(where: { id: number }) {\n    return where;\n  }\n}\n` +
        'declare const repo: Wrapper;\nvoid [repo, ids];\n',
    ),
  ],
  invalid: [
    main.fixes(COUPON_BEFORE, COUPON_AFTER),
    main.declines(`${HEAD}${lookup('BigThing', 'id: key')}`),
    main.declines(`${HEAD}${lookup('Token', 'id: key')}`),
    main.declines(`${HEAD}${lookup('Member', 'teamId: key', 'ids')}`),
    main.declines(`${HEAD}${lookup('Note', 'email: key')}`),
    main.declines(`${HEAD}${lookup('Price', 'amount: key', 'ids')}`),
    main.declines(`${HEAD}${lookup('Plain', 'id: key', 'ids')}`),
    main.declines(`${HEAD}${lookup('User', 'id: key')}`),
    main.declines(`${HEAD}${lookup('User', 'nickname: key')}`),
    main.declines(`${HEAD}${lookup('User', 'tags: key')}`),
  ],
});

old.project.tester.run('typeorm before 0.3', ioInLoop, {
  valid: [],
  invalid: [old.declines(`${HEAD}${lookup('User', 'id: key', 'ids')}`)],
});

mysql.project.tester.run('typeorm on MySQL', ioInLoop, {
  valid: [],
  invalid: [
    mysql.declines(`${HEAD}${lookup('User', 'email: key')}`),
    mysql.declines(`${HEAD}${lookup('Coupon', 'code: key')}`),
  ],
});

mssql.project.tester.run('typeorm on SQL Server', ioInLoop, {
  valid: [],
  invalid: [mssql.declines(`${HEAD}${lookup('Coupon', 'code: key')}`)],
});

postgres.project.tester.run('typeorm on PostgreSQL', ioInLoop, {
  valid: [],
  invalid: [postgres.fixes(COUPON_BEFORE, COUPON_AFTER)],
});

typescriptRuleTester().run('typeorm lookups without type information', ioInLoop, {
  valid: [],
  invalid: [{ code: COUPON_BEFORE, errors: [{ messageId: 'query' }] }],
});
