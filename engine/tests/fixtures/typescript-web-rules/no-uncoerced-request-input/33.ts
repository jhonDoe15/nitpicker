import { z } from 'zod';
const Query = z.object({ page: z.number() });
export function list(req) { const Query = z.object({ page: z.coerce.number() }); return Query.parse(req.query); }