import { Repository } from 'typeorm';
import { Expr } from './store';
declare const exprs: Repository<InstanceType<typeof Expr>>;
declare function use(value: unknown): void;
export async function run() { for (const e of await exprs.find()) { use(await e.rel); } }
export {};
