import { z } from 'zod';
const Query = z.object({ page: z.number(), name: z.string() });
export const list = (req) => Query.omit({ page: true } as const).parse(req.query);