import { Repository } from 'typeorm';
import type { EntityManager as Unused } from '@mikro-orm/core';
import { PrismaClient } from '@prisma/client';
import { Account } from './sequelize-store';
import { Order, Audited, Versioned, Watched, Parent, MikroManager } from './store';
declare const orderRepo: Repository<Order>;
declare const auditedRepo: Repository<Audited>;
declare const versionedRepo: Repository<Versioned>;
declare const watchedRepo: Repository<Watched>;
declare const looseRepo: Repository<any>;
declare const parentRepo: Repository<Parent>;
declare const tokenRepo: Repository<Order>;
declare const em: MikroManager;
declare const prisma: PrismaClient;
declare const cutoff: Date;
declare const bus: { emit(name: string): void };
declare function nextStatus(order: Order): string;
export async function run() { const rows = await em.find(Order, {}); for (const row of rows) { row.status = "x"; } }