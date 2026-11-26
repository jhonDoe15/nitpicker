import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
import type { User } from '@prisma/client';
export function view(user: User): { email: string } { return { email: user.email }; }