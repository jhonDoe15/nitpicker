import { z } from 'zod';
const Limit = z.number();
const Query = z.object({ limit: Limit, all: z.boolean().optional() });
export async function list(request) { return Query.safeParseAsync(request.query); }