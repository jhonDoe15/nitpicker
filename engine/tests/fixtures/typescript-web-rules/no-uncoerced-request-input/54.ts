import { z } from 'zod';
const Base = z.object({ page: z.number(), size: z.number() });
const Extra = z.object({ size: z.coerce.number(), all: z.boolean() });
export const list = (req) => Base.merge(Extra).parse(req.query);