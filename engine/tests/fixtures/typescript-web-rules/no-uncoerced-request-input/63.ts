import { Controller, Get, Post, Query, Body, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PageDto } from './dto';
@Controller('items')
export class ItemsController {
@Get() list(@Query() query: PageDto) { return query; }
}