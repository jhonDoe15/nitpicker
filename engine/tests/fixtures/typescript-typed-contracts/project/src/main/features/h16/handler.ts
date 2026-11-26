import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
import type { Context } from 'koa';
export function show(ctx: Context, cat: CatDocument): void { ctx.body = cat; }