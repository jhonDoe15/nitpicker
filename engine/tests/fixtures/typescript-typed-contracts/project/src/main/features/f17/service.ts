import type { Prisma, PrismaClient } from '@prisma/client';
import type { Knex } from 'knex';
export class OrderService {
  constructor(private readonly db: PrismaClient) {}
  transaction(): Prisma.TransactionClient { return this.db; }
  list(): Promise<Map<string, Knex.QueryBuilder<string>[]>> { return Promise.resolve(new Map()); }
}
