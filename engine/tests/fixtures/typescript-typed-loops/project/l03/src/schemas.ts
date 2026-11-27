import { EntitySchema, Repository } from 'typeorm';
import * as T from 'typeorm';
export interface Invoice { id: number; payer: Promise<object>; owner: Promise<object>; carrier: Promise<object> }
export interface Bill { payer: Promise<object>; }
export const InvoiceSchema = new EntitySchema<Invoice>({
  name: 'Invoice',
  relations: { payer: { type: 'many-to-one', lazy: true }, owner: { type: 'many-to-one' }, 'quotedRel': { lazy: true } },
});
export const BillSchema = new T.EntitySchema<Bill>({ relations: { payer: { lazy: true } } });
export const Untyped = new EntitySchema({ name: `Tpl`, relations: { carrier: { lazy: true } } });
export const NoName = new EntitySchema({ relations: { first: { lazy: true } } });
function inner() { return new EntitySchema<Alias2>({ name: 'Deep', relations: { deep: { lazy: true } } }); }
type Alias2 = { deep: Promise<object> };
export declare const shipments: Repository<any>;
export declare const bills: Repository<Bill>;
export declare const aliases: Repository<import('./store').Alias>;
export declare const records: Repository<Record<string, Promise<object>>>;
