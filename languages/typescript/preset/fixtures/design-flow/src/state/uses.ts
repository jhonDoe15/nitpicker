export interface Clock {
  now(): number;
}

export interface Ctx {
  clock: Clock;
  db: string;
  name: string;
  locale: string;
  mode: string;
  user: string;
}

const holder: { ctx?: Ctx } = {};

function extra(first: number, second: number): void {
  void first;
  void second;
}

export function reads(ctx: Ctx): number {
  return ctx.clock.now();
}

export function destructures(ctx: Ctx): string {
  const { db, name } = ctx;
  return db + name;
}

export function destructuresRest(ctx: Ctx): string {
  const { db, ...rest } = ctx;
  return db + String(rest);
}

export function destructuresParameter({ db, name }: Ctx): string {
  return db + name;
}

export function passes(ctx: Ctx): number {
  return reads(ctx);
}

export function returns(ctx: Ctx): Ctx {
  return ctx;
}

export function stores(ctx: Ctx): void {
  holder.ctx = ctx;
}

export function spreads(ctx: Ctx): Ctx {
  return { ...ctx };
}

export function captures(ctx: Ctx): () => string {
  return () => ctx.db;
}

export function computed(ctx: Ctx, key: keyof Ctx): unknown {
  return ctx[key];
}

export function external(ctx: Ctx): void {
  console.log(ctx);
}

export function undeclaredPosition(ctx: Ctx): void {
  extra(1, 2, ctx);
}

export function untouched(ctx: Ctx): number {
  return ctx.locale.length;
}
