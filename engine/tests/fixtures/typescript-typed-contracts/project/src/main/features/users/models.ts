import { Model } from 'sequelize';
import type { HydratedDocument } from 'mongoose';
export class Invoice extends Model {}
export type ProfileDocument = HydratedDocument<{ name: string }>;
export interface Cat { name: string }
export type CatDocument = HydratedDocument<Cat>;
