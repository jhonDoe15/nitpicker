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
export async function run(id: string) { await mutex.runExclusive(async () => format(id)); }