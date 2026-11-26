import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
import type { Context } from 'koa';
export function a(ctx: Context) { ctx.body = new Audit(); ctx.body += 'x'; ctx['body'] = new Audit(); ctx.status = new Audit() as never; (ctx).body = (new Audit()); ctx.body = [new UserEntity(), new Audit()]; }
export function b(ctx: Context, other: { body: unknown }) { other.body = new Audit(); ctx.body ||= new Audit(); }
