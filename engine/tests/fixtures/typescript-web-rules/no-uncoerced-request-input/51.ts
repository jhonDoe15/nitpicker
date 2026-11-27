import * as v from 'valibot';
const Query = v.object({ limit: v.optional(v.pipe(v.number(), v.integer())), all: v.boolean() });
export function list(req) { return v.parse(Query, req.query); }