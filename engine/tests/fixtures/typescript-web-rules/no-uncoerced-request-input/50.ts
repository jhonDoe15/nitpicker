import { z } from 'zod';
const Headers = z.object({ retry: z.object({ count: z.int32() }) });
export function get(ctx) { return Headers.parse(ctx.request.headers); }