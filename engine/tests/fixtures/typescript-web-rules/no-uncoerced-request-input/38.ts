import { z } from 'zod';
const Body = z.object({ limit: z.number() });
export function create(req) { return Body.parse(req.body); }