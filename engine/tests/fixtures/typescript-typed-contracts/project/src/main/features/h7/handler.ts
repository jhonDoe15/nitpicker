import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
export function GET(): UserEntity { return new UserEntity(); }