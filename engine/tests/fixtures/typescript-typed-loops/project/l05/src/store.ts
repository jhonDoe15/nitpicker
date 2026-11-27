import { Pool } from 'pg';
import axios from 'axios';
import { Model, type BelongsToGetAssociationMixin } from 'sequelize';
export const pool = new Pool();
export async function loadOrder(id: string) { return pool.query("select 1", [id]); }
export async function loadPrice(id: string) { return axios.get(id); }
export async function viaHelper(id: string) { return loadOrder(id); }
export function format(id: string) { return id.trim(); }
export async function saveBatch(rows: string[]) { return pool.query("insert", [rows]); }
export class OrderService {
  constructor(private readonly db: Pool) {}
  async find(id: string) { return this.db.query("select 1", [id]); }
}
export class UserRepository { findById(id: string) { return id; } }
export type OrderStore = { find(id: string): Promise<unknown> };
export type Viewer = { update(id: string): void };
export function createOrderStore(db: Pool): OrderStore {
  return { find: (id) => db.query("select 1", [id]) };
}
export class Customer extends Model {
  declare getAccount: BelongsToGetAssociationMixin<Customer>;
}
