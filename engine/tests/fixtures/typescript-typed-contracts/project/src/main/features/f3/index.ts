import type { NextFunction, Request, Response } from 'express';
export function getOrder(req: Request, res: Response): void { res.json(req.params); }