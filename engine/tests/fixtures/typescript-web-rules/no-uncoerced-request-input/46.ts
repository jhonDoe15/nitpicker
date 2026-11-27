import { parse } from './schemas';
export function list(req) { return parse(req.query); }