import { z } from 'zod';
const Base = z.object({ page: z.number() });
const Extra = z.object({ page: z.coerce.number(), size: z.int() });
export const list = (req) => Base.extend(Extra.shape).pick({ size: true }).parse(req.query);