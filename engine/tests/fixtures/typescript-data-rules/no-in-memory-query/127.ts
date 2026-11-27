import { EntityManager, Repository } from 'typeorm';
import { PrismaClient } from '@prisma/client';
import { Account, Order } from './store';
declare const orderRepo: Repository<Order>;
declare const manager: EntityManager;
declare const prisma: PrismaClient;
declare const email: string;
declare const where: { status: string };
declare function use(value: unknown): void;
export async function run() { return (await orderRepo.find({ where, select: { id: true }, relations: ["x"] })).length; }