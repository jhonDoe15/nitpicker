import { EntitySchema, Repository } from 'typeorm';
export interface Invoice { id: number; payer: Promise<object>; owner: Promise<object> }
export const InvoiceSchema = new EntitySchema<Invoice>({
  name: 'Invoice',
  relations: { payer: { type: 'many-to-one', lazy: true }, owner: { type: 'many-to-one' } },
});
export declare const shipments: Repository<any>;
