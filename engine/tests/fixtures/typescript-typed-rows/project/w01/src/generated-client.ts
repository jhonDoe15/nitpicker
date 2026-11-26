import type * as runtime from '@prisma/client/runtime/library';
type Row = { id: string };
export declare const prismaGenerated: {
  order: { findFirst(args?: { where?: object }): Promise<Row | null> };
};
export type Runtime = typeof runtime;
