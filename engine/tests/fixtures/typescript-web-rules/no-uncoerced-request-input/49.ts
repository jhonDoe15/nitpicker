import { z } from 'zod';
export function get(req) { return z.object({ id: z.bigint() }).parse(req.params); }