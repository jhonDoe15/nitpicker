import type { FastifyReply } from 'fastify';
import type { Request as R2 } from 'express-serve-static-core';
import { Context } from 'hono';
import { UserEntity } from '../users/user.entity';
export function a(reply: FastifyReply) { reply.send(new UserEntity()); }
export function b(c: Context) { c.json(new UserEntity()); }
export function c(r: R2) { r.body = new UserEntity(); }
