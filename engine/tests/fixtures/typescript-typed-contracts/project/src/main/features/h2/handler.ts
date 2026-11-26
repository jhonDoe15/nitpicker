import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
import type { Request, Response } from 'express';
export function show(req: Request, res: Response): void { res.json({ email: String(req.body) }); }