import { Controller, Get, Post } from '@nestjs/common';
@Authenticated({ permission: Permission.Read })
@Controller('orders')
class OrdersController { @Get() list() {} }