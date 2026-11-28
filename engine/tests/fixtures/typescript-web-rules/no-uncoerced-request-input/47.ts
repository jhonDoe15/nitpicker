import { z } from 'zod';
const Query = z.object({ limit: z.number().int().min(1).default(20), name: z.string() });
export function list(req) { return Query.parse(req.query); }