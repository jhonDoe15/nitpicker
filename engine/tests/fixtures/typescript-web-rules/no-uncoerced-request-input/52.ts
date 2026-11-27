import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
export const route = zValidator('query', z.object({ page: z.number(), all: z.coerce.boolean() }));