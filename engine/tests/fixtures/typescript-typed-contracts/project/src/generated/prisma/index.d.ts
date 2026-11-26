export declare class PrismaClient { $connect(): Promise<void> }
export declare namespace Prisma {
  type $AccountPayload = { name: 'Account'; scalars: { id: string; balance: number } };
}
type Scalars = Prisma.$AccountPayload['scalars'];
export type Account = { [K in keyof Scalars]: Scalars[K] };