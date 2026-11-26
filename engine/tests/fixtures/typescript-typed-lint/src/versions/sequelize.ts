import { Model } from 'sequelize';
declare const sequelize: object;
export class Invoice extends Model { declare total: number; }
Invoice.init({}, { sequelize });
export class Receipt extends Model { declare total: number; }
Receipt.init({}, { sequelize, version: true });
