import { Plain, Locked, Child, NotMapped } from './typeorm';
import { Ledger, Booked } from './mikro';
import { Invoice, Receipt } from './sequelize';

declare function repo<T>(): { findOne(id: number): Promise<T | null>; find(): Promise<T[]>; save(row: unknown): Promise<unknown> };
declare function locked<T>(): { findOne(options: object): Promise<T | null>; save(row: unknown): Promise<unknown> };
declare const em: { flush(): Promise<void>; findOne<T>(entity: new () => T, id: number): Promise<T | null> };

export async function lockedFirst() {
  const row = await locked<Plain>().findOne({ where: { id: 1 }, lock: { mode: 'pessimistic_write' } });
  row!.balance = 1;
  await locked<Plain>().save(row);
}
export async function versioned() {
  const row = await repo<Child>().findOne(1);
  row!.balance = 1;
  await repo<Child>().save(row);
  const booked = await em.findOne(Booked, 1);
  booked!.total = 1;
  await em.flush();
  const receipt = await Receipt.findByPk(1);
  receipt.total = 1;
  await receipt.save();
}
export async function unmapped() {
  const row = await repo<NotMapped>().findOne(1);
  row!.balance = 1;
  await repo<NotMapped>().save(row);
  const kept = await repo<Locked>().findOne(1);
  return kept!.balance;
}
export async function typeorm() {
  const row = await repo<Plain>().findOne(1);
  row!.balance += 1;
  await repo<Plain>().save(row);
}
export async function typeormList() {
  const rows = await repo<Plain>().find();
  for (const row of rows) {
    row.balance = 0;
  }
  await repo<Plain>().save(rows);
}
export async function mikro() {
  const row = await em.findOne(Ledger, 1);
  row!.total = 2;
  await em.flush();
}
export async function sequelize() {
  const row = await repo<Invoice>().findOne(1);
  row!.total = 2;
  await row!.save();
}
