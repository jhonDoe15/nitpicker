import { PrismaClient } from '@prisma/client';
import { DataSource } from 'typeorm';
import { Mutex, Semaphore } from 'async-mutex';
import { Pool } from 'pg';
import axios from 'axios';
import { notify, publish, format } from './store';
const prisma = new PrismaClient();
declare const dataSource: DataSource;
const mutex = new Mutex();
const guard = new Mutex();
const limiter = new Semaphore(5);
const single = new Semaphore(1);
const pool = new Pool();
declare const apm: { startTransaction(name: string): { end(): void } };
declare const uow: { transaction<T>(work: (ctx: { log(text: string): void }) => Promise<T>): Promise<T> };
interface Gateway { send(id: string): Promise<unknown>; }
class BaseGateway { async send(id: string) { return axios.post('/notify', { id }); } }
class HttpGateway extends BaseGateway implements Gateway {}
export const made: Gateway = new HttpGateway();
declare const gateway: Gateway;
export async function run(id: string) { await dataSource.transaction(async (manager) => { await manager.save({ id }); await gateway.send(id); }); }
