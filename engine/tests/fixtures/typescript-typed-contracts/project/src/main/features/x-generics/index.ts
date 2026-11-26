import type { Prisma, PrismaClient } from '@prisma/client';
import type { Knex } from 'knex';
export declare function a(): Promise<PrismaClient>;
export declare function b(): PrismaClient[];
export declare function c(): [string, PrismaClient];
export declare function d(): Map<string, Knex.Transaction>;
export declare function e<T extends PrismaClient>(t: T): T;
export declare function f(): Readonly<{ x: PrismaClient }>;
export declare function g(): () => PrismaClient;
