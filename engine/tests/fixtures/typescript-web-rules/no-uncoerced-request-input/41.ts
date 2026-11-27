import { z } from 'zod';
const Query = z.object({ limit: z.union([z.number(), z.string()]) });
export function list(req) { return Query.parse(req.query); }