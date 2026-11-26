import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
@Controller('orders')
export class OrdersController { @Get() list(@Req() request: Request): string[] { return [String(request.body)]; } }