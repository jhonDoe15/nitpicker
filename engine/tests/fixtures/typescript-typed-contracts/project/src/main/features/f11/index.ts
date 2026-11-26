import type { NextFunction, Request, Response } from 'express';
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void { res.json(String(err)); next(); }