import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
export const route = zValidator('json', z.object({ limit: z.number() }));