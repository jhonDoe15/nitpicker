import { Audit } from '../users/user.entity';
export function GET() { return new Audit(); }
export const POST = () => new Audit();
