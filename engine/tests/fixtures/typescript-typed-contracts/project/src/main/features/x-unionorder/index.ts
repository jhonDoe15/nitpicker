import type { Prisma, PrismaClient } from '@prisma/client';
import type { Knex } from 'knex';
import type { NextFunction, Request, Response, Handler } from 'express';
export declare function m(): Response | Knex.Transaction | PrismaClient;
export declare function n(): Promise<PrismaClient | Response | Knex.QueryBuilder<string>>;
export declare function o(x: Knex.Transaction | PrismaClient): void;
