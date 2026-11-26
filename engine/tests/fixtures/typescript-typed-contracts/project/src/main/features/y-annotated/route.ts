import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
export const GET: () => Promise<UserEntity[]> = async () => [];
export const POST = (async (a: Audit) => a);
export const PUT = function (a: Audit): void { void a; };
export const DELETE = 5;
export const { PATCH } = { PATCH: () => new Audit() };
export default function GET2(): Audit { return new Audit(); }
