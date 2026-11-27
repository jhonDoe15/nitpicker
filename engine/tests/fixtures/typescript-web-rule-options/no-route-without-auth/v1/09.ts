import { Controller, Get, Post } from '@nestjs/common';
@Controller('orders')
class OrdersController { @Post() @UseGuards(JwtGuard) create() {} }