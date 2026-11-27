import { z } from 'zod';
export function list(c) { return z.object({ page: z.number() }).parse(c.req.query()); }