import { z } from 'zod';
const Query = z.object({ limit: z.coerce.number() });
export function list(req) { return Query.parse(req.query); }