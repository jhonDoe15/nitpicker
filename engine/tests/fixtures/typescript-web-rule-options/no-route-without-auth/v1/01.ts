import { Controller, Get, Post } from '@nestjs/common';
@Controller('orders')
class OrdersController { @Get() @Authenticated({ permission: Permission.Read }) list() {} }