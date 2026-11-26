import type { Prisma, PrismaClient } from '@prisma/client';
export class Q {
  private a(db: PrismaClient): void { void db; }
  protected b(db: PrismaClient): void { void db; }
  #c(db: PrismaClient): void { void db; }
  constructor(private readonly d: PrismaClient, public e: () => PrismaClient) {}
  get g(): PrismaClient { return this.d; }
  set h(v: PrismaClient) { void v; }
  static s(db: PrismaClient): void { void db; }
  static #t(db: PrismaClient): void { void db; }
  readonly f = (db: PrismaClient): void => { void db; };
}
