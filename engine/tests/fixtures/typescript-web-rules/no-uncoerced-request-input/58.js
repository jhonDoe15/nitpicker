const { z } = require('zod');
const Query = z.object({ page: z.number() });
exports.list = (req) => Query.parse(req.query);