import { Model } from 'sequelize';
export class Account extends Model { declare status: string; static findAll(options?: object): Promise<Account[]> { return Promise.resolve([]); } }
