import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unfiltered-soft-delete-read.mts';

const ORMS = ['typeorm', 'prisma', 'drizzle', 'kysely', 'knex', 'sequelize', 'mikro'];
const COLUMN = ['asset__deletedAt'];
const HELPER = ['asset__helper__withDefaultVisibility'];

function valid(code, filters = COLUMN) {
  return { code, options: [{ orms: ORMS, filters }] };
}

function invalid(code, filters = COLUMN) {
  return { code, options: [{ orms: ORMS, filters }], errors: [{ messageId: 'unfiltered' }] };
}

typescriptRuleTester().run('no-unfiltered-soft-delete-read', rule, {
  valid: [
    valid(
      "async function f(db) { return db.selectFrom('asset').selectAll().where('asset.deletedAt', 'is', null).execute(); }",
    ),
    valid(
      "async function f(db) { return db.selectFrom('asset').innerJoin('album', 'album.id', 'asset.albumId').where('deletedAt', 'is', null).execute(); }",
    ),
    valid(
      "async function f(db) { return db.selectFrom('asset').selectAll().$call(withDefaultVisibility).execute(); }",
      HELPER,
    ),
    valid("async function f(db) { return db.selectFrom('album').selectAll().execute(); }"),
    valid("async function f(knex) { return knex('assets').where({ deleted_at: null }).first(); }", [
      'asset__deleted_at',
    ]),
    valid("async function f(knex) { return knex('assets').whereNull('assets.deleted_at'); }"),
    valid(
      'class S { find() { return this.assetRepository.find({ where: { deletedAt: IsNull() } }); } }',
    ),
    valid(
      "class S { find() { return this.assetRepository.createQueryBuilder('a').where('a.deletedAt IS NULL').getMany(); } }",
    ),
    valid('class S { find() { return this.assetRepository.find({ withDeleted: true }); } }'),
    valid(
      'class S { find() { return this.assetRepository.find({ where: { deletedAt: Not(IsNull()) } }); } }',
    ),
    valid(
      'class S { find() { return this.prisma.asset.findMany({ where: { deletedAt: null } }); } }',
    ),
    valid(
      'class S { find() { return this.prisma.asset.findMany({ where: { ownerId: 1, ...notDeleted() } }); } }',
      ['asset__helper__notDeleted'],
    ),
    valid(
      'async function f(db) { return db.select().from(assets).where(and(eq(assets.ownerId, 1), isNull(assets.deletedAt))); }',
    ),
    valid('async function f() { return Asset.findAll({ where: { deletedAt: null } }); }'),
    valid("async function f(db) { return db.selectFrom('asset').selectAll().execute(); }", []),
    valid("async function f(db) { const q = db.selectFrom('asset').selectAll(); return q; }"),
    valid("async function f(db) { return db.selectFrom('asset').selectAll().execute(); }", [
      'album__deletedAt',
    ]),
  ],
  invalid: [
    invalid(
      "class S { find() { return this.assetRepository.find({ where: { status: 'archived' } }); } }",
    ),
    invalid(
      "class S { find() { this.logger.log('deleted'); return this.assetRepository.find({ where: { owner: 1 } }); } }",
    ),
    invalid("async function f(db) { return db.selectFrom('asset').selectAll().execute(); }"),
    invalid(
      "async function f(db) { return db.selectFrom('asset').selectAll().where('asset.id', '=', 1).executeTakeFirst(); }",
    ),
    invalid(
      "async function f(db) { return db.selectFrom('album').innerJoin('asset', 'asset.albumId', 'album.id').selectAll().execute(); }",
    ),
    invalid(
      "async function f(db) { return db.selectFrom('asset').selectAll().$call(other).execute(); }",
      HELPER,
    ),
    invalid("async function f(knex) { return knex('assets').where({ id: 1 }).first(); }"),
    invalid('class S { find() { return this.assetRepository.find({ where: { ownerId: 1 } }); } }'),
    invalid('class S { find() { return this.assetRepository.findOneBy({ id: 1 }); } }'),
    invalid(
      "class S { find() { return this.assetRepository.createQueryBuilder('a').where('a.ownerId = :id').getMany(); } }",
    ),
    invalid('class S { find() { return this.prisma.asset.findMany({ where: { ownerId: 1 } }); } }'),
    invalid(
      'class S { find() { return this.prisma.album.findMany({ include: { assets: { where: {} } } }); } }',
      ['album__deletedAt'],
    ),
    invalid(
      'async function f(db) { return db.select().from(assets).where(eq(assets.ownerId, 1)); }',
    ),
    invalid('async function f() { return Asset.findAll({ where: { ownerId: 1 } }); }'),
    invalid('class S { find() { return this.em.find(Asset, { owner: 1 }); } }', [
      'asset__deletedAt',
    ]),
  ],
});
