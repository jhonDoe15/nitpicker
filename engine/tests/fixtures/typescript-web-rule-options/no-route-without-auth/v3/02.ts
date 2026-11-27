import { Controller, Get, Post } from '@nestjs/common';
@UseGuards(JwtGuard)
@Controller('orders')
class OrdersController { @Get() list() {} }