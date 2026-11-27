import { z } from 'zod';
const key = 'page';
export const list = (req) => z.object({ [key]: z.number() }).parse(req.query);