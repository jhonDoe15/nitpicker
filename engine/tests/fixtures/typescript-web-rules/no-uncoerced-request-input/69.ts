import { z } from 'zod';
declare const req: any, o: any;
const S = z.object({ a: z.number() });
const [[x = S.parse(req.query)]] = o;
(function () { S.parse(req.params); })();
