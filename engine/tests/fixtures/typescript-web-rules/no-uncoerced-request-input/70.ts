import { z } from 'zod';
declare const req: any, dec: any;
const S = z.object({ a: z.number() });
class A { m(@dec(S.parse(req.query)) { x }: any) {} }
{ { { { S.parse(req.params); } } } }
