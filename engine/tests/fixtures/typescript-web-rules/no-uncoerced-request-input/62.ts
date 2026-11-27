import { Controller, Get, Post, Query, Body, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ListDto } from './dto';
@Controller('items')
export class ItemsController {
@Get() list(@Query() query: ListDto) { return query; }
}