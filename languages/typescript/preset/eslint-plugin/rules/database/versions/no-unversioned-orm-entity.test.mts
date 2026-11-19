import { typedIoProject } from '../../../test-support/projects/typed-io-project.mts';
import { rule } from './no-unversioned-orm-entity.mts';

const STORE = [
  "import { Entity, Column } from 'typeorm';",
  'declare function VersionColumn(): PropertyDecorator;',
  '@Entity() export class Plain { @Column() balance = 0; }',
  '@Entity() export class Locked { @Column() balance = 0; @VersionColumn() version = 0; }',
  '@Entity() export class Child extends Locked { @Column() note = ""; }',
  'export class NotMapped { balance = 0; }',
].join('\n');

const MIKRO = [
  "import '@mikro-orm/core';",
  'declare function Entity(): ClassDecorator;',
  'declare function Property(options?: object): PropertyDecorator;',
  '@Entity() export class Ledger { @Property() total = 0; }',
  '@Entity() export class Booked { @Property() total = 0; @Property({ version: true }) version = 0; }',
].join('\n');

const SEQUELIZE = [
  "import { Model } from 'sequelize';",
  'declare const sequelize: object;',
  'export class Invoice extends Model { declare total: number; }',
  'Invoice.init({}, { sequelize });',
  'export class Receipt extends Model { declare total: number; }',
  'Receipt.init({}, { sequelize, version: true });',
  'export class Voucher extends Model { declare total: number; }',
  'Voucher.init({}, { sequelize, tableName: "vouchers", version: false });',
].join('\n');

const { tester, typed } = typedIoProject('unversioned-entity', STORE, {
  'mikro-store.ts': MIKRO,
  'sequelize-store.ts': SEQUELIZE,
});

const HEADER = [
  "import { Plain, Locked, Child, NotMapped } from './store';",
  "import { Ledger, Booked } from './mikro-store';",
  "import { Invoice, Receipt } from './sequelize-store';",
  'declare function repo<T>(): { findOne(id: number): Promise<T | null>; find(): Promise<T[]>; save(row: unknown): Promise<unknown> };',
  'declare function locked<T>(): { findOne(options: object): Promise<T | null>; save(row: unknown): Promise<unknown> };',
  'declare const em: { flush(): Promise<void>; findOne<T>(entity: new () => T, id: number): Promise<T | null> };',
  '',
].join('\n');

const inRun = (body: string) => typed(`${HEADER}export async function run() { ${body} }`);
const bad = (body: string, messageId: string, entity: string) => ({
  ...inRun(body),
  errors: [{ messageId, data: { entity } }],
});

tester.run('no-unversioned-orm-entity', rule, {
  valid: [
    inRun(
      "const row = await locked<Plain>().findOne({ where: { id: 1 }, lock: { mode: 'pessimistic_write' } }); row!.balance = 1; await locked<Plain>().save(row);",
    ),
    inRun(
      'const row = await locked<Invoice>().findOne({ where: { id: 1 }, lock: true }); row!.total = 1; await row!.save();',
    ),
    inRun(
      'const row = await em.findOne(Ledger, 1, { lockMode: 4 }); row!.total = 2; await em.flush();',
    ),
    inRun(
      'const row = await repo<Locked>().findOne(1); row!.balance = 1; await repo<Locked>().save(row);',
    ),
    inRun(
      'const row = await repo<Child>().findOne(1); row!.balance = 1; await repo<Child>().save(row);',
    ),
    inRun('const row = await repo<Plain>().findOne(1); return row!.balance;'),
    inRun('const row = await repo<Plain>().findOne(1); row!.balance = 1; return row;'),
    inRun('await repo<Plain>().save({ balance: 1 });'),
    inRun('const rows = await repo<Plain>().find(); return rows.length;'),
    inRun(
      'const row = await repo<NotMapped>().findOne(1); row!.balance = 1; await repo<NotMapped>().save(row);',
    ),
    inRun('const row = await em.findOne(Booked, 1); row!.total = 1; await em.flush();'),
    inRun('const row = await Receipt.findByPk(1); row.total = 1; await row.save();'),
    inRun(
      'const row = await repo<any>().findOne(1); row.balance = 1; await repo<any>().save(row);',
    ),
  ],
  invalid: [
    bad(
      'const row = await repo<Plain>().findOne(1); row!.balance += 1; await repo<Plain>().save(row);',
      'typeorm',
      'Plain',
    ),
    bad(
      'const rows = await repo<Plain>().find(); for (const row of rows) { row.balance = 0; } await repo<Plain>().save(rows);',
      'typeorm',
      'Plain',
    ),
    bad(
      'const row = await em.findOne(Ledger, 1); row!.total = 2; await em.flush();',
      'mikro',
      'Ledger',
    ),
    bad(
      'const row = await repo<Invoice>().findOne(1); row!.total = 2; await row!.save();',
      'sequelize',
      'Invoice',
    ),
  ],
});
