import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
@Controller('x')
export class A { @Get() one(@Req() r: Request): Request { return r; } }
@Controller()
export class B { constructor(private readonly p: Request) {} get two(): Request { return this.p; } static make(r: Request): B { return new B(r); } }
export class C { one(r: Request): void { void r; } }
