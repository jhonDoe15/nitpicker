import * as v from 'valibot';
const Query = v.object({ limit: v.pipe(v.string(), v.toNumber(), v.number()) });
export function list(req) { return v.parse(Query, req.query); }