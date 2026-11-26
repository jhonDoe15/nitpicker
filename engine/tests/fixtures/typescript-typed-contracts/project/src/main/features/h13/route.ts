import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
import type { User } from '@prisma/client';
export const POST = async (): Promise<Response> => Response.json([] as User[]);