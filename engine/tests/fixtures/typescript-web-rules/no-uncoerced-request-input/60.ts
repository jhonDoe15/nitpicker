import { CoercedSchema } from './dto';
export function list(req: { query: unknown }) { return CoercedSchema.parse(req.query); }