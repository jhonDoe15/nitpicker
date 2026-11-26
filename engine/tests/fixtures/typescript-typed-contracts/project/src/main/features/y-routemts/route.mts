import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
export function GET(): Audit { return new Audit(); }
export async function HEAD(a: AdminEntity) { return a; }
function OPTIONS(): Audit { return new Audit(); }
export { OPTIONS };
