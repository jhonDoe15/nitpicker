import { z } from 'zod';
const Query = z.object({ page: z.number() });
export const route = { schema: { querystring: Query, params: z.object({ id: z.number() }) } };