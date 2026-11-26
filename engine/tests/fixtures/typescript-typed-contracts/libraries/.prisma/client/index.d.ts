import * as $Result from '@prisma/client/runtime/library';
export declare class PrismaClient {
  user: Prisma.UserDelegate;
  post: Prisma.PostDelegate;
  $transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
export declare namespace Prisma {
  type TransactionClient = Omit<PrismaClient, '$transaction'>;
  interface UserDelegate { findMany(): Promise<User[]> }
  interface PostDelegate { findMany(): Promise<Post[]>; findFirst(): Promise<Post | null> }
  type $PostPayload = { name: 'Post'; objects: {}; scalars: { id: string; title: string }; composites: {} };
  type PostGetPayload<S> = $Result.GetResult<Prisma.$PostPayload, S>;
}
export type Post = $Result.DefaultSelection<Prisma.$PostPayload>;
export type User = { id: string; email: string; passwordHash: string };
export type Role = 'admin' | 'member';