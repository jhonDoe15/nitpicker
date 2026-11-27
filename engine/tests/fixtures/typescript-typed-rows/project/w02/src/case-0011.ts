import { Repository } from 'typeorm';
import { PrismaClient } from '@prisma/client';
import { Order, Shape, Mapped, Custom } from './store';
declare const orderRepo: Repository<Order>;
declare const shapeRepo: { find(): Promise<Shape[]>; findOne(): Promise<Shape | null>; count(): Promise<number> };
declare const mappedRepo: { find(): Promise<Mapped[]> };
declare const unionRepo: { find(): Promise<Order[] | Shape[]> };
declare const maybeRepo: { find(): Promise<Order[] | undefined> };
declare const customRepo: Custom;
declare const prisma: PrismaClient;
declare function use(x: unknown): void;
export async function run() { return (await unionRepo.find()).map((row) => row.status); }