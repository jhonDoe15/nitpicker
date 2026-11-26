import type { NextFunction, Request, Response, Handler } from 'express';
export const h: Handler = (req, res, next) => { res.json(req.body); next(); };
export function mw(req: Request, res: Response, next: NextFunction): Response { return res; }
export function other(res: Response): Response { return res; }
