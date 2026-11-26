import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
import type { Request, Response } from 'express';
export function a(res: Response) { res?.json(new Audit()); (res.json)(new Audit()); res['json'](new Audit()); res.send(new AdminEntity()); res.json(); res.json(...[new Audit()]); res.json((new Audit())); }
export function b(res: Response, x: UserEntity | Audit) { res.json(x); res.send({ a: x }); res.json([x]); res.json(new Map<string, UserEntity>()); res.json(Promise.resolve(x)); }
export function c(res: { json(x: unknown): void }) { res.json(new Audit()); }
export function d(res: Response) { res.status; res.json<Audit>(new Audit()); res.json(new Audit(), new UserEntity()); }
