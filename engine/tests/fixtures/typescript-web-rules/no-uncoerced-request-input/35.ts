import { z } from 'zod';
const Query = z.object({ page: z.number().or(z.string().transform(Number)), size: z.number().catch(20) });
export const list = (req) => Query.parse(req.query);