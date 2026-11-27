import { Controller, Get, Post } from '@nestjs/common';
@Controller('orders')
class OrdersController { @Get() @UseGuards(JwtGuard) list() {} }