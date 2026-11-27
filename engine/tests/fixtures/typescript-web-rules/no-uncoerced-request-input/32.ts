import { z } from 'zod';
const Query = z.object({ page: z.number() });
export function list(req, Query) { return Query.parse(req.query); }