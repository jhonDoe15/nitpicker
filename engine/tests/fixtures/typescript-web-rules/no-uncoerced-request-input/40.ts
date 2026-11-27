import { z } from 'zod';
export function list(req) { return z.object({ id: z.string().uuid(), at: z.preprocess((value) => new Date(String(value)), z.date()) }).parse(req.params); }