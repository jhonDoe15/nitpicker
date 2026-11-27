import { z } from 'zod';
export const route = { schema: { body: z.object({ limit: z.number() }) } };