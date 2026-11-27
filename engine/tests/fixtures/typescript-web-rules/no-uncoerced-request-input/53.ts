import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
export const route = zValidator('form', z.object({ size: z.number() }));