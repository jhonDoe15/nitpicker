import { z } from 'zod';
const Query = z.object({ limit: z.number() });
export function load(input) { return Query.parse(input.query); }