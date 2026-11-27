import { UploadSchema } from './dto';
export function list(req: { query: unknown }) { return UploadSchema.parse(req.query); }