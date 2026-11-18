import { describe, expect, it } from 'vitest';
import { detectConventions } from '../../../../../shared/conventions/detect.mjs';
import { TRANSACTIONS_CONVENTION, projectOpensTransactions } from './transactions.mts';

const accepts = (_definition, file) => !/\.test\.|^test\//u.test(file);

function detect(files) {
  const source = {
    paths: () => Object.keys(files),
    readMany: (paths) => new Map(paths.map((file) => [file, files[file]])),
  };
  return detectConventions({ definitions: [TRANSACTIONS_CONVENTION], source, accepts })[
    TRANSACTIONS_CONVENTION.id
  ];
}

describe('typescript.transactions', () => {
  it.each([
    'await this.dataSource.transaction(async (manager) => {});',
    'await prisma.$transaction(async (tx) => {});',
    'await em.transactional(async (em) => {});',
    '@Transactional()\nasync run() {}',
    'const trx = await knex.transaction();',
    'const runner = db.createQueryRunner(); await runner.startTransaction();',
  ])('follows a project that opens transactions: %s', (code) => {
    expect(detect({ 'src/a.ts': code, 'src/b.ts': 'export const b = 1;' }).choice).toBe('used');
  });

  it('keeps the default when only tests or comments open transactions', () => {
    const files = {
      'src/a.test.ts': 'await db.transaction(async () => {});',
      'src/b.ts': '// await db.transaction(async () => {});\nexport const b = 1;',
      'test/c.ts': 'await db.transaction(async () => {});',
    };

    expect(detect(files).choice).toBe('unused');
  });

  it('reads the followed choice for the rule options', () => {
    expect(projectOpensTransactions({ 'typescript.transactions': 'used' })).toBe(true);
    expect(projectOpensTransactions({})).toBe(false);
  });
});
