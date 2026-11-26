import type { NextFunction, Request, Response } from 'express';
export function sendOrder(id: string, res: Response): void { res.json(id); }