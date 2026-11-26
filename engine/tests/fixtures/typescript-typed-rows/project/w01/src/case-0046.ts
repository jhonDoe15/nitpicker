import { Repository } from 'typeorm';
import { EntityManager } from '@mikro-orm/core';
import { PrismaClient } from '@prisma/client';
import { Account } from './sequelize-store';
import { Order } from './store';
import { Wrapper } from './wrappers';
import { Inheriting, Overriding } from './repositories';
import { prismaGenerated } from './generated-client';
declare const inheritingRepo: Inheriting;
declare const overridingRepo: Overriding;
declare const orderRepo: Repository<Order>;
declare const looseRepo: Repository<any>;
declare const em: EntityManager;
declare const workspaceRepo: Wrapper;
declare const prisma: PrismaClient;
declare const cache: { count(): Promise<number> };
declare function use(value: unknown): void;
export async function run() { return (await orderRepo.countBy({ status: "a" })) >= 1; }