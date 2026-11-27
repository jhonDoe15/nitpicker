import { loadRow, users, walk, a, viaAny, subscribe, later, type OrderPort, type ById } from './store';
import knex from 'knex';
import { model } from 'mongoose';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import * as constants from './plain';
declare const port: OrderPort;
declare const store: ById;
declare const ids: string[];
declare const groups: string[][];
declare const apiClient: any;
const db = knex({});
const redis = new Redis();
const prisma = new PrismaClient();
export async function run() { for (const id of ids) { await a(id); } }